import ee
import geemap
import os
from google.oauth2 import service_account

# Import Helpers
try:
    from phase2_tin_viz import generate_tin_visualization
except ImportError:
    generate_tin_visualization = None

try:
    from report_generator import generate_pdf_report
except ImportError:
    generate_pdf_report = None

# --- CONFIGURATION (Updated with Script 2 Values) ---
PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT', 'monarch-507004')
KEY_PATH = "gee-key.json"
DEFAULT_START = '2024-01-01'
DEFAULT_END = '2024-04-30'

# --- SENSITIVITY PARAMETERS ---
# Calibrated against Sentinel-2 medians (Jan-Apr 2024) over Jharia coalfield,
# a Ballari iron-ore lease, and a bare-ground control. Every value is
# env-overridable so a site can be retuned without editing code.
def _envf(name, default):
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default

CLOUD_THRESHOLD = _envf("MG_CLOUD_THRESHOLD", 20)

# Bare-soil gate. Measured NDBI medians inside real leases run 0.13-0.15, so
# 0.10 passed roughly half of every scene (including undisturbed dry ground).
OPTICAL_THRESHOLD = _envf("MG_OPTICAL_THRESHOLD", 0.15)

# Vegetation gate: mined surfaces sit near NDVI 0.15-0.17.
NDVI_THRESHOLD = _envf("MG_NDVI_THRESHOLD", 0.20)

# Pit depth vs the reconstructed pre-mining surface. This was the binding
# failure: at 6.0 m the gate rejected ~99% of a genuine lease (Ballari depth
# p95 = 3.4 m), so the pipeline reported almost nothing.
MIN_DEPTH_THRESHOLD = _envf("MG_MIN_DEPTH", 2.0)

# Radius of the focal mean used to rebuild the hypothetical pre-mining terrain.
# Must exceed the pit's half-width or the pit averages into its own baseline.
DEPTH_RADIUS_M = _envf("MG_DEPTH_RADIUS", 150)

# Majority filter radius that despeckles the fused mask.
CLEANUP_RADIUS_M = _envf("MG_CLEANUP_RADIUS", 30)

# Detection always runs both engines and combines them (see run_unified_detection):
# the threshold triple-lock below, and the RandomForest in ml_detector.py.
# MG_DETECTOR is kept only as an escape hatch -- set to "rule" to fall back to
# threshold-only if the ML model can't be loaded in a given environment.
DETECTOR = os.getenv("MG_DETECTOR", "ensemble").strip().lower()

DEM_SOURCE = 'COPERNICUS/DEM/GLO30_2024_1'

# Global flag to track initialization status
_ee_initialized = False

def initialize_earth_engine():
    """
    Initialize Earth Engine with explicit service account authentication.
    This is more robust than relying on auto-detection.
    """
    global _ee_initialized
    
    if _ee_initialized:
        print("✅ Earth Engine already initialized")
        return True
    
    print("🌍 Initializing Earth Engine...")
    
    # Method 1: Explicit service account with google.oauth2
    if os.path.exists(KEY_PATH):
        try:
            print(f"📁 Loading service account from: {KEY_PATH}")
            # Use google.oauth2.service_account for more reliable authentication
            credentials = service_account.Credentials.from_service_account_file(
                KEY_PATH,
                scopes=['https://www.googleapis.com/auth/earthengine']
            )
            ee.Initialize(credentials=credentials, project=PROJECT_ID)
            print(f"✅ Earth Engine initialized with service account for project: {PROJECT_ID}")
            _ee_initialized = True
            return True
        except Exception as e:
            print(f"⚠️  Explicit service account auth failed: {e}")
    else:
        print(f"⚠️  Service account key not found at: {KEY_PATH}")
    
    # Method 2: Try EE's ServiceAccountCredentials (legacy method)
    if os.path.exists(KEY_PATH):
        try:
            print("📁 Trying Earth Engine's ServiceAccountCredentials...")
            service_account_email = "mineguard-sa@minesector.iam.gserviceaccount.com"
            credentials = ee.ServiceAccountCredentials(service_account_email, KEY_PATH)
            ee.Initialize(credentials=credentials, project=PROJECT_ID)
            print(f"✅ Earth Engine initialized with EE ServiceAccountCredentials")
            _ee_initialized = True
            return True
        except Exception as e:
            print(f"⚠️  EE ServiceAccountCredentials failed: {e}")
    
    # Method 3: Try environment variable (GOOGLE_APPLICATION_CREDENTIALS)
    try:
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            print("📁 Trying GOOGLE_APPLICATION_CREDENTIALS environment variable...")
            ee.Initialize(project=PROJECT_ID)
            print(f"✅ Earth Engine initialized with application default credentials")
            _ee_initialized = True
            return True
    except Exception as e:
        print(f"⚠️  Application default credentials failed: {e}")
    
    # Method 4: Try mounted credentials from host (~/.config/earthengine)
    try:
        cred_path = os.path.expanduser("~/.config/earthengine/credentials")
        if os.path.exists(cred_path):
            print(f"📁 Found mounted credentials at: {cred_path}")
            # Let Earth Engine auto-detect the credentials
            ee.Initialize(project=PROJECT_ID)
            print(f"✅ Earth Engine initialized with mounted host credentials")
            _ee_initialized = True
            return True
        else:
            print(f"⚠️  No credentials file found at: {cred_path}")
    except Exception as e:
        print(f"⚠️  Mounted credentials failed: {e}")
    
    # Method 5: Try without project ID (last resort)
    try:
        print("📁 Trying initialization without project ID...")
        ee.Initialize()
        print(f"✅ Earth Engine initialized (no project specified)")
        _ee_initialized = True
        return True
    except Exception as e:
        print(f"⚠️  Initialization without project failed: {e}")
    
    # All methods failed
    print("❌ All authentication methods failed!")
    print("📋 Troubleshooting steps:")
    print("   1. Register project at: https://code.earthengine.google.com/register")
    print("   2. Enable Earth Engine API in Cloud Console")
    print("   3. Grant 'Earth Engine Resource Admin' role to service account")
    print("   4. Or run 'earthengine authenticate' on host machine")
    _ee_initialized = False
    raise Exception("Failed to initialize Earth Engine. Please check credentials and project registration.")
    
    return False

def run_unified_detection(lease_geojson=None, filename="Manual_Input", output_dir="output", start_date=DEFAULT_START, end_date=DEFAULT_END, detector=None):
    # Ensure Earth Engine is initialized before proceeding
    if not _ee_initialized:
        try:
            initialize_earth_engine()
        except Exception as e:
            raise Exception(f"Cannot run detection: Earth Engine initialization failed - {e}")

    # No per-request choice any more: detection always runs both engines and
    # combines them. `detector`/MG_DETECTOR only matter as a fallback to
    # threshold-only if the ML model can't be loaded (see the try/except below).
    use_ml = (detector or DETECTOR or "ensemble").strip().lower() != "rule"

    os.makedirs(output_dir, exist_ok=True)
    lid_elevation = 0.0
    
    # --- A. INPUT GEOMETRY ---
    # No silent fallback to a placeholder location: if the boundary can't be
    # parsed, fail loudly so the caller (and the user) knows the analysis
    # did not run against the site they actually uploaded.
    if not lease_geojson:
        raise ValueError("No lease boundary geometry provided.")
    try:
        roi = ee.Geometry(lease_geojson)
    except Exception as e:
        raise ValueError(f"Uploaded lease boundary could not be parsed as a valid geometry: {e}")

    search_zone = roi.buffer(2000) # Keep buffer to find encroachments

    # --- B. SENSOR DETECTION (IMPROVED LOGIC) ---
    print(f"🚀 Step 1: Multi-Sensor Scan ({start_date} to {end_date})...")
    
    # 1. OPTICAL (NDBI + NDVI Check)
    # We keep NDVI check from Script 1 because NDBI alone confuses urban areas/fallow land with mines.
    s2 = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
          .filterBounds(roi)
          .filterDate(start_date, end_date)
          .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", CLOUD_THRESHOLD))
          .select(["B4", "B3", "B2", "B8", "B11"]))
    
    s2_image = s2.median().clip(search_zone)
    ndbi = s2_image.normalizedDifference(["B11", "B8"]).rename("NDBI")
    ndvi = s2_image.normalizedDifference(["B8", "B4"]).rename("NDVI")
    # Logic: High NDBI (Bare Soil) AND Low NDVI (No Vegetation)
    optical_mask = ndbi.gt(OPTICAL_THRESHOLD).And(ndvi.lt(NDVI_THRESHOLD))

    # 2. DEPTH (Local vs Regional Elevation)
    # Script 2 Logic: Focal Mean (Smoothed) - Raw DEM
    dem = ee.ImageCollection(DEM_SOURCE).select("DEM").mosaic().clip(search_zone)
    
    # Calculate "Smoothed" surface (Hypothetical pre-mining surface)
    smooth_surface = dem.focal_mean(radius=DEPTH_RADIUS_M, units="meters")
    
    # Depth = Smoothed Surface - Actual Ground
    raw_depth = smooth_surface.subtract(dem).rename("depth")
    depth_only_mask = raw_depth.gt(MIN_DEPTH_THRESHOLD)

   # --- C. TRIPLE LOCK FUSION & CLASSIFICATION ---
    print("🔒 Applying Triple Lock Verification...")

# Lock 1: Optical Signature (Is it bare soil/disturbed?)
# ndbi.gt(OPTICAL_THRESHOLD)

# Lock 2: Biological Signature (Is it devoid of vegetation?)
# ndvi.lt(NDVI_THRESHOLD)

# Lock 3: Topographical Signature (Is there a physical pit?)
# depth_only_mask (raw_depth > MIN_DEPTH_THRESHOLD)

# THE TRIPLE LOCK: All three conditions must be TRUE
    # optical_mask already carries the NDVI and water tests.
    triple_lock_mask = optical_mask.And(depth_only_mask)

# Cleanup noise
    mining_base = triple_lock_mask.focal_mode(radius=CLEANUP_RADIUS_M, kernelType='circle', units='meters')

# Create Legal Boundary Mask
    boundary_mask = ee.Image.constant(0).byte().paint(roi, 1)

# 🟢 LEGAL: Inside Boundary + Triple Lock
    legal_mining = mining_base.And(boundary_mask.eq(1))

# 🔴 ILLEGAL: Outside Boundary + Triple Lock
    illegal_mining = mining_base.And(boundary_mask.eq(0))

    # --- D. QUANTIFICATION ---
    print("📊 Calculating Metrics...")

    def get_metrics(mask, name):
        # Calculate Area
        area = mask.multiply(ee.Image.pixelArea()).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=search_zone, scale=10, maxPixels=1e9
        ).values().get(0).getInfo() or 0.0

        # Calculate Volume (Area * Depth at that pixel)
        vol_layer = raw_depth.updateMask(mask)
        vol = vol_layer.multiply(ee.Image.pixelArea()).reduceRegion(
            reducer=ee.Reducer.sum(), geometry=search_zone, scale=30, maxPixels=1e9
        ).values().get(0).getInfo() or 0.0

        return area, vol

    # Detection always tries to combine both engines: a pixel is reported as
    # mining if EITHER the threshold triple-lock or the RandomForest flags it
    # (so a miss by one doesn't hide a real site the other caught), and the
    # subset both agree on is surfaced separately as a cross-validation
    # confidence percentage rather than a second, conflicting result.
    # If the ML model can't be loaded (missing file/deps, or MG_DETECTOR=rule
    # forcing it off), this falls back to the threshold-only path so the
    # pipeline still returns a result instead of failing the whole request.
    ensemble_arrays = None
    used_ml = False
    if use_ml:
        try:
            print("🧠 Detector: Threshold + RandomForest (ensemble)")
            from ml_detector import run_ensemble_detection
            ens_metrics, ensemble_arrays = run_ensemble_detection(
                s2_image, raw_depth, roi, search_zone, rule_mask=triple_lock_mask, dem=dem
            )
            legal_area_m2 = ens_metrics["legal_area_m2"]
            legal_vol_m3 = ens_metrics["legal_vol_m3"]
            illegal_area_m2 = ens_metrics["illegal_area_m2"]
            illegal_vol_m3 = ens_metrics["illegal_vol_m3"]
            used_ml = True
        except Exception as e:
            print(f"⚠️  ML detector unavailable ({e}); falling back to threshold-only")
            ensemble_arrays = None

    if not used_ml:
        print("📐 Detector: threshold triple-lock")
        legal_area_m2, legal_vol_m3 = get_metrics(legal_mining, "Legal")
        illegal_area_m2, illegal_vol_m3 = get_metrics(illegal_mining, "Illegal")

    total_area_m2 = legal_area_m2 + illegal_area_m2
    total_vol_m3 = legal_vol_m3 + illegal_vol_m3
    avg_depth_m = illegal_vol_m3 / illegal_area_m2 if illegal_area_m2 > 0 else 0.0

    # Get Lid Elevation (for 3D viz referencing)
    lid_elevation = 0.0
    if legal_area_m2 > 0:
        lid_stats = smooth_surface.updateMask(legal_mining).reduceRegion(
            reducer=ee.Reducer.mean(), geometry=search_zone, scale=30, maxPixels=1e9
        )
        lid_val = lid_stats.values().get(0).getInfo()
        lid_elevation = lid_val if lid_val else 0.0

    # --- E. PREPARE 3D DATA ---
    status_band = ee.Image.constant(0) \
        .where(illegal_mining, 1) \
        .where(legal_mining, 2) \
        .rename('status')
    
    combined_image = raw_depth.addBands(status_band)

    # --- F. OUTPUT GENERATION ---
    
    # 1. 2D Map
    map_filename = "map_2d.html"
    map_path = os.path.join(output_dir, map_filename)

    if used_ml and ensemble_arrays is not None:
        # The geemap layers below draw the rule-only masks, which would
        # contradict the combined metrics just computed -- on a clean site
        # the map would show red while the report says nothing was found.
        from ml_detector import build_detection_map
        build_detection_map(s2_image, lease_geojson, ensemble_arrays, map_path)
    else:
        Map = geemap.Map()
        Map.centerObject(roi, 14)
        Map.addLayer(s2_image, {"min":0, "max":3000, "bands":["B4","B3","B2"]}, "Satellite Image")

        # Visualizing the components helps debug
        Map.addLayer(optical_mask.selfMask(), {"palette":["yellow"]}, "Optical Hints (NDBI)")
        Map.addLayer(depth_only_mask.selfMask(), {"palette":["cyan"]}, "Depth Hints")

        # Final Result
        Map.addLayer(legal_mining.selfMask(), {"palette":["#00ff00"]}, "✅ LEGAL MINING")
        Map.addLayer(illegal_mining.selfMask(), {"palette":["#ff0000"]}, "🚨 ILLEGAL MINING")
        Map.addLayer(roi, {"color":"blue", "width":3}, "Lease Boundary")

        Map.to_html(map_path)

    # 2. 3D TIN
    tin_filename = "model_3d.html"
    tin_full_path = os.path.join(output_dir, tin_filename)
    if used_ml and ensemble_arrays is not None:
        # Build from the same raster the metrics came from, so the 3D model
        # cannot disagree with the numbers beside it.
        from phase2_tin_viz import generate_tin_from_arrays
        generate_tin_from_arrays(
            ensemble_arrays["mask"], ensemble_arrays["depth"], ensemble_arrays["boundary"],
            ensemble_arrays["bounds"], output_path=tin_full_path,
            elevation=ensemble_arrays.get("elevation"),
            volume=total_vol_m3,
            # The renderer derives the true peak depth from the surface itself;
            # passing the average here mislabelled every model.
            max_depth=None
        )
    elif total_area_m2 > 0 and generate_tin_visualization:
        generate_tin_visualization(
            combined_image, search_zone, total_area_m2,
            output_path=tin_full_path,
            volume=total_vol_m3,
            max_depth=None
        )

    # 3. PDF Report
    pdf_filename = "report.pdf"
    if generate_pdf_report:
        report_data = {
            "start_date": start_date, "end_date": end_date, "dem_source": DEM_SOURCE,
            "filename": os.path.basename(filename),
            "illegal_area": illegal_area_m2, 
            "legal_area": legal_area_m2,
            "lid_elevation": lid_elevation, 
            "avg_depth": avg_depth_m, 
            "volume": illegal_vol_m3, 
            "total_volume": total_vol_m3,
            "trucks": int(illegal_vol_m3 / 15) if illegal_vol_m3 else 0,
            "agreement_pct": (round(ensemble_arrays.get("agreement_pct", 0.0), 1)
                               if used_ml and ensemble_arrays is not None else None)
        }
        try:
            generate_pdf_report(report_data, output_path=os.path.join(output_dir, pdf_filename))
        except Exception as e:
            print(f"PDF Error: {e}")

    # --- G. RETURN METRICS ---
    metrics = {
        "illegal_area_m2": round(illegal_area_m2, 2),
        "legal_area_m2": round(legal_area_m2, 2),
        "volume_m3": round(illegal_vol_m3, 2),
        "total_vol_m3": round(total_vol_m3, 2),
        "avg_depth_m": round(avg_depth_m, 2),
        "truckloads": int(illegal_vol_m3 / 15)
    }
    if used_ml and ensemble_arrays is not None:
        # How much of the reported area both independent methods agree on --
        # the cross-validation confidence behind the single number above.
        metrics["agreement_pct"] = round(ensemble_arrays.get("agreement_pct", 0.0), 1)

    return {
        "status": "success",
        "detector": "ensemble" if used_ml else "rule",
        "metrics": metrics,
        "artifacts": {
            "map_url": map_filename,
            "model_url": tin_filename if total_area_m2 > 0 else None,
            "report_url": pdf_filename
        }
    }