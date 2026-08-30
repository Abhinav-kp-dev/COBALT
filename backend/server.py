from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form
from pydantic import BaseModel
from typing import List
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import shutil
import os
import glob
import uuid
import shapely.geometry
from geoalchemy2.shape import from_shape

# Import Engines
from file_processor import process_lease_file
from phase1_detection import run_unified_detection, initialize_earth_engine

# Import Database
from database import get_db
from models import Inspection

# Initialize FastAPI app
app = FastAPI(title="MineGuard Enterprise API")

# --- INITIALIZE EARTH ENGINE AT STARTUP ---
@app.on_event("startup")
async def startup_event():
    """Initialize Earth Engine when FastAPI starts"""
    print("🚀 Starting MineGuard API...", flush=True)
    try:
        initialize_earth_engine()
        print("✅ Startup complete!", flush=True)
    except Exception as e:
        print(f"⚠️  WARNING: Earth Engine initialization failed: {e}", flush=True)
        print("⚠️  API will start but Earth Engine operations will fail!", flush=True)

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("🛑 Shutting down MineGuard API...", flush=True)

# --- CONFIGURATION ---
# Get public URL from environment or default to localhost
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "http://localhost:8000")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup Directories
UPLOAD_DIR = "static/uploads"
OUTPUT_DIR = "static/outputs"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Mount Static Files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def home():
    return {"status": "MineGuard System v2.0 Online", "public_url": API_PUBLIC_URL}

@app.post("/api/analyze")
async def analyze_mining_site(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    start_date: str = Form("2024-01-01"),
    end_date: str = Form("2024-04-30"),
):
    """
    Analyzes the file AND saves the result to the PostgreSQL Database.
    """
    job_id = str(uuid.uuid4())[:8]
    user_filename = file.filename
    # Sanitize filename
    safe_filename = f"{job_id}_{user_filename.replace(' ', '_')}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    
    print(f"📥 Processing Job: {job_id} | File: {user_filename}")

    # 1. Save & Process File
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        lease_geojson = process_lease_file(file_path)
    except Exception as e:
        print(f"❌ File Error: {e}")
        raise HTTPException(status_code=500, detail=f"File Error: {str(e)}")

    # Reject invalid/unreadable boundary files instead of silently
    # falling back to a placeholder location later in the pipeline.
    if not lease_geojson:
        raise HTTPException(
            status_code=400,
            detail="Could not read a valid lease boundary from the uploaded file. "
                   "Please check the file is a valid .zip (shapefile), .kml, or .geojson."
        )

    # Build a WKB geometry for PostGIS storage (always as MULTIPOLYGON
    # to match the Inspection model's column type).
    db_geometry = None
    try:
        shapely_geom = shapely.geometry.shape(lease_geojson)
        if shapely_geom.geom_type == "Polygon":
            shapely_geom = shapely.geometry.MultiPolygon([shapely_geom])
        db_geometry = from_shape(shapely_geom, srid=4326)
    except Exception as e:
        print(f"⚠️  Could not convert boundary to DB geometry: {e}")

    # 2. Run AI Engine
    try:
        job_output_dir = os.path.join(OUTPUT_DIR, job_id)
        
        # No client-selectable detector: run_unified_detection always combines
        # the threshold and ML engines (falling back to threshold-only itself
        # if the ML model can't be loaded).
        result = run_unified_detection(
            lease_geojson,
            filename=user_filename,
            output_dir=job_output_dir,
            start_date=start_date,
            end_date=end_date,
        )
        
        metrics = result["metrics"]
        artifacts = result.get("artifacts", {})
        
        # 3. SAVE TO DATABASE
        # Construct URLs using the dynamic API_PUBLIC_URL
        url_report = f"{API_PUBLIC_URL}/static/outputs/{job_id}/{artifacts.get('report_url')}"
        url_map = f"{API_PUBLIC_URL}/static/outputs/{job_id}/{artifacts.get('map_url')}"
        url_model = None
        if artifacts.get('model_url'):
            url_model = f"{API_PUBLIC_URL}/static/outputs/{job_id}/{artifacts.get('model_url')}"
        
        new_inspection = Inspection(
            job_id=job_id,
            filename=user_filename,
            illegal_area_m2=metrics["illegal_area_m2"],
            volume_m3=metrics["volume_m3"],
            avg_depth_m=metrics["avg_depth_m"],
            truckloads=metrics["truckloads"],
            status=result["status"],
            report_url=url_report,
            map_url=url_map,
            model_url=url_model,
            geometry=db_geometry
        )
        
        db.add(new_inspection)
        db.commit()
        db.refresh(new_inspection)
        print(f"💾 Saved to Database: Inspection ID {new_inspection.id}")

        # Return result with correct URLs
        result["job_id"] = job_id
        result["urls"] = {
            "report": url_report,
            "map": url_map,
            "3d_model": url_model
        }

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ Pipeline Error: {e}")
        raise HTTPException(status_code=500, detail=f"Pipeline Error: {str(e)}")

@app.get("/api/history")
def get_history(db: Session = Depends(get_db)):
    """
    Fetch past inspections for the Dashboard.

    Serialised explicitly: the `geometry` column is a PostGIS WKBElement,
    which FastAPI cannot encode, and returning the ORM objects directly
    fails the whole request with "'WKBElement' object is not iterable".
    """
    rows = db.query(Inspection).order_by(Inspection.created_at.desc()).all()
    return [
        {
            "id": r.id,
            "job_id": r.job_id,
            "filename": r.filename,
            "illegal_area_m2": r.illegal_area_m2,
            "volume_m3": r.volume_m3,
            "avg_depth_m": r.avg_depth_m,
            "truckloads": r.truckloads,
            "status": r.status,
            "report_url": r.report_url,
            "map_url": r.map_url,
            "model_url": r.model_url,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


# --- INSPECTION LOG MANAGEMENT ---

class DeleteRequest(BaseModel):
    """Body for the bulk delete endpoint."""
    ids: List[int]


def _purge_job_artifacts(job_id: str) -> None:
    """
    Remove the rendered artifacts for one job.

    The DB row is the only index into these files, so deleting the row without
    this leaves orphaned report/map/model HTML on disk forever.
    """
    if not job_id:
        return
    out_dir = os.path.join(OUTPUT_DIR, job_id)
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir, ignore_errors=True)
    for upload in glob.glob(os.path.join(UPLOAD_DIR, f"{job_id}_*")):
        try:
            os.remove(upload)
        except OSError:
            pass


@app.delete("/api/inspections/{inspection_id}")
def delete_inspection(inspection_id: int, db: Session = Depends(get_db)):
    """Delete a single inspection and its artifacts."""
    row = db.query(Inspection).filter(Inspection.id == inspection_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Inspection not found")

    job_id = row.job_id
    db.delete(row)
    db.commit()
    _purge_job_artifacts(job_id)
    print(f"🗑️  Deleted inspection {inspection_id} ({job_id})")
    return {"deleted": [inspection_id], "count": 1}


@app.post("/api/inspections/delete")
def delete_inspections(payload: DeleteRequest, db: Session = Depends(get_db)):
    """Delete several inspections in one call, for multi-select in the UI."""
    if not payload.ids:
        return {"deleted": [], "count": 0}

    rows = db.query(Inspection).filter(Inspection.id.in_(payload.ids)).all()
    job_ids = [(r.id, r.job_id) for r in rows]
    for r in rows:
        db.delete(r)
    db.commit()

    for _, job_id in job_ids:
        _purge_job_artifacts(job_id)

    deleted = [i for i, _ in job_ids]
    print(f"🗑️  Deleted {len(deleted)} inspection(s): {deleted}")
    return {"deleted": deleted, "count": len(deleted)}
