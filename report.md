# MineGuard.ai — Project Report

## 1. Project Overview

**MineGuard.ai** is an autonomous geospatial forensics platform designed to detect illegal mining activity using satellite imagery and machine learning pipelines. Illegal mining causes $12B+ in economic losses globally and results in severe environmental degradation. Traditional monitoring methods are slow, dangerous, and easily evaded.

MineGuard provides a high-confidence forensic pipeline that fuses optical and topographical satellite data to:

- Detect illegal mining encroachments against legal lease boundaries
- Calculate stolen volumes (m³) and estimated logistics impact (truckloads)
- Generate court-ready digital evidence (PDF reports, 2D maps, 3D models)
- Store inspection records in a spatially-indexed database

**Target Users:** Government mining authorities, environmental enforcement agencies, and compliance officers.

---

## 2. Architecture

The system follows a **microservice architecture** deployed via Docker Compose with three services:

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Frontend    │  │   Backend    │  │   Database   │  │
│  │  React + Vite │──│  FastAPI     │──│  PostGIS     │  │
│  │  Nginx        │  │  + GEE SDK   │  │  (PostgreSQL)│  │
│  │  :3000 → 80   │  │  :8001→8000  │  │  :5433→5432  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                          │
│  Frontend ──HTTP──▶ Backend ──SQL/ORM──▶ Database        │
│  Backend  ──API───▶ Google Earth Engine (external)       │
└─────────────────────────────────────────────────────────┘
```

### Service Details

| Service | Image / Stack | Container Name | Exposed Port | Purpose |
|---------|---------------|----------------|--------------|---------|
| `db` | `postgis/postgis` | `mineguard-db` | 5433 → 5432 | Spatial database for inspection records |
| `backend` | Python 3.10 + FastAPI | `mineguard-api` | 8001 → 8000 | API server + GEE detection engine |
| `frontend` | Node 18 → Nginx Alpine | `mineguard-ui` | 3000 → 80 | React dashboard UI |

### Data Flow

```
User uploads file (KML/Shapefile/GeoJSON)
    │
    ▼
Frontend (React) ──POST /api/analyze──▶ Backend (FastAPI)
    │                                        │
    │                                  file_processor.py
    │                                  (reproject to EPSG:4326, sanitize coords)
    │                                        │
    │                                  phase1_detection.py
    │                                  (GEE: Sentinel-2 + Copernicus DEM)
    │                                  Triple-Lock classification
    │                                        │
    │                                  Generate artifacts:
    │                                  ├── map_2d.html (geemap)
    │                                  ├── model_3d.html (TIN visualization)
    │                                  └── report.pdf (FPDF)
    │                                        │
    │                                  Save to PostGIS (Inspection record)
    │                                        │
    ▼◀─────────────── JSON response ─────────┘
Frontend renders metrics + iframes for 3D/2D/PDF views
```

---

## 3. Backend Deep Dive

### 3.1 API Server (`server.py`)

FastAPI application with CORS middleware (allow all origins). Initializes Earth Engine on startup.

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check — returns system status |
| `POST` | `/api/analyze` | Upload a file + date range → run detection → save to DB → return results |
| `GET` | `/api/history` | Fetch all past inspections (ordered by newest first) |

**`/api/analyze` Request:**
- `file` (multipart): KML, Shapefile (.zip), or GeoJSON
- `start_date` (form): Analysis start date (default: `2024-01-01`)
- `end_date` (form): Analysis end date (default: `2024-04-30`)

**`/api/analyze` Response:**
```json
{
  "status": "success",
  "metrics": {
    "illegal_area_m2": 12345.67,
    "legal_area_m2": 54321.00,
    "volume_m3": 8765.43,
    "total_vol_m3": 12345.67,
    "avg_depth_m": 2.50,
    "truckloads": 584
  },
  "artifacts": {
    "map_url": "map_2d.html",
    "model_url": "model_3d.html",
    "report_url": "report.pdf"
  },
  "urls": {
    "report": "http://localhost:8001/static/outputs/{job_id}/report.pdf",
    "map": "http://localhost:8001/static/outputs/{job_id}/map_2d.html",
    "3d_model": "http://localhost:8001/static/outputs/{job_id}/model_3d.html"
  }
}
```

Each job generates a UUID-based `job_id` (first 8 chars). All artifacts are saved under `static/outputs/{job_id}/`.

### 3.2 Detection Pipeline (`phase1_detection.py`)

The core intelligence engine. Uses Google Earth Engine (GEE) for satellite data processing.

#### Triple-Lock Verification System

All three conditions must be TRUE for a pixel to be classified as mining:

| Lock | Name | Sensor | Logic | Threshold |
|------|------|--------|-------|-----------|
| 1 | Optical Signature | Sentinel-2 (B11, B8) | NDBI > threshold (bare soil detection) | `0.07` |
| 2 | Biological Signature | Sentinel-2 (B8, B4) | NDVI < threshold (no vegetation) | `0.25` |
| 3 | Topographical Forensics | Copernicus GLO30 DEM | Depth = Focal Mean(250m) - Raw DEM > threshold | `2.0 m` |

#### Detection Steps

1. **Input Geometry**: User-uploaded boundary → ROI. A 2km buffer is added to `search_zone` to detect encroachments outside the legal boundary.

2. **Optical Scan**: Sentinel-2 SR Harmonized imagery filtered by cloud cover (<20%) and date range. Computes NDBI (bare soil index) and NDVI (vegetation health).

3. **Depth Analysis**: Copernicus GLO30 DEM is smoothed using `focal_mean(radius=250m)` to reconstruct hypothetical pre-mining terrain. Depth = smoothed surface − actual DEM.

4. **Triple-Lock Fusion**: All three masks are combined with `AND` logic. Noise is cleaned using `focal_mode(radius=10m)`.

5. **Legal/Illegal Classification**: A boundary mask splits the mining mask — pixels inside the lease boundary are "LEGAL", pixels outside are "ILLEGAL".

6. **Quantification**:
   - **Area** (m²): Pixel area sum within each mask at 10m scale
   - **Volume** (m³): Depth × pixel area sum at 30m scale
   - **Avg Depth** (m): Volume / Area
   - **Truckloads**: Volume / 15 (assuming 15 m³ per truck)

7. **Output Generation**:
   - **2D Map** (`map_2d.html`): Geemap interactive map with satellite imagery, NDBI hints, depth hints, legal/illegal overlays, and lease boundary
   - **3D Model** (`model_3d.html`): TIN visualization (generated by `phase2_tin_viz.py` if available)
   - **PDF Report** (`report.pdf`): Generated by `report_generator.py` if available

#### Earth Engine Authentication

The system attempts 5 authentication methods in order:

1. Explicit service account via `google.oauth2` (`gee-key.json`)
2. EE legacy `ServiceAccountCredentials`
3. `GOOGLE_APPLICATION_CREDENTIALS` environment variable
4. Mounted host credentials (`~/.config/earthengine/credentials`)
5. Unauthenticated initialization (last resort)

### 3.3 File Processor (`file_processor.py`)

Handles ingestion of geospatial boundary files.

**Supported Formats:**
- `.zip` (ESRI Shapefile archive — searches for `.shp` inside)
- `.kml` (Keyhole Markup Language)
- `.geojson` / `.json`

**Processing Steps:**
1. Extract zip if needed, locate `.shp` file
2. Read with GeoPandas
3. Reproject to EPSG:4326 (WGS84) if needed
4. Merge all geometries via `unary_union`
5. Extract clean Polygon/MultiPolygon (handles GeometryCollection, self-intersections via buffer(0), fallback to bounding box)
6. Sanitize coordinates — strip Z-axis (3D → 2D), convert numpy types to Python floats
7. Return clean GeoJSON dict

### 3.4 Database Schema (`models.py`)

**Table: `inspections`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer (PK) | Auto-increment ID |
| `job_id` | String (unique, indexed) | 8-char UUID |
| `filename` | String | Original uploaded filename |
| `illegal_area_m2` | Float | Detected illegal mining area |
| `volume_m3` | Float | Estimated stolen volume |
| `avg_depth_m` | Float | Average pit depth |
| `truckloads` | Integer | Estimated truck loads |
| `status` | String | Job status |
| `report_url` | String | URL to PDF report |
| `map_url` | String | URL to 2D map |
| `model_url` | String | URL to 3D model |
| `geometry` | MultiPolygon (SRID 4326) | PostGIS spatial column |
| `created_at` | DateTime | Auto-set on creation |

### 3.5 Standalone CLI (`main.py`)

An interactive command-line entry point that prompts for a file path, processes it through `file_processor.py`, and runs the detection pipeline. Useful for debugging without the web server.

---

## 4. Frontend Deep Dive

### 4.1 Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| React | 19.2.0 | UI framework |
| Vite | 7.2.4 | Build tool / dev server |
| Tailwind CSS | 4.1.7 | Utility-first CSS |
| Axios | 1.13.2 | HTTP client |
| Lucide React | 0.555.0 | Icon library |

### 4.2 Dashboard Layout (`App.jsx`)

Single-page application with a responsive 12-column grid layout:

```
┌─────────────────────────────────────────────────────────┐
│  HEADER: MineGuard Enterprise + Status Badge            │
├──────────┬──────────────────────────────────────────────┤
│ LEFT     │  MAIN DISPLAY (9 cols)                       │
│ (3 cols) │                                              │
│          │  ┌────────────────────────────────────────┐  │
│ Upload   │  │ Metrics Row (4 cards)                  │  │
│ Panel    │  │ Area │ Volume │ Depth │ Truckloads     │  │
│          │  └────────────────────────────────────────┘  │
│ Date     │  ┌────────────────────────────────────────┐  │
│ Pickers  │  │ Visualization Window (tabbed)          │  │
│          │  │ [3D FORENSICS] [SATELLITE MAP] [PDF]   │  │
│ [RUN]    │  │                                        │  │
│          │  │  (iframe content based on active tab)   │  │
│ History  │  │                                        │  │
│ Sidebar  │  └────────────────────────────────────────┘  │
└──────────┴──────────────────────────────────────────────┘
```

### 4.3 Key UI Components

**Upload Panel:**
- Drag-and-drop style file input (accepts KML/Shapefile/GeoJSON)
- Start/End date pickers for custom temporal analysis
- "RUN DETECTION" button with loading spinner

**Metrics Row (4 cards):**
- Detected Illegal Area (m²) — orange
- Stolen Volume (m³) — cyan
- Avg. Pit Depth (m) — purple
- Impact (Truckloads) — red

**Visualization Window (3 tabs):**
- **3D FORENSICS**: Embeds the TIN 3D model HTML in an iframe
- **SATELLITE MAP**: Embeds the geemap 2D HTML in an iframe
- **OFFICIAL REPORT**: Embeds the PDF report in an iframe
- Status badge: "NON-COMPLIANT" (red) or "COMPLIANT" (green)

**History Sidebar:**
- Scrollable list of past inspections
- Each item shows filename, date, volume, and ILLEGAL/CLEAN badge
- Click any item to reload its results into the main view

### 4.4 API Client (`api.js`)

Two functions:
- `uploadFile(file, startDate, endDate)` — POST multipart to `/api/analyze`
- `fetchHistory()` — GET from `/api/history`

API base URL is hardcoded to `http://localhost:8001`.

### 4.5 Styling

Dark theme with a `slate` color palette. Custom scrollbar styling. Glassmorphic card design with `backdrop-blur-sm` and subtle borders. Gradient header text. All styling is done via Tailwind utility classes inline.

---

## 5. Configuration

### Environment Variables

| Variable | Service | Value | Purpose |
|----------|---------|-------|---------|
| `POSTGRES_USER` | db | `postgres` | Database username |
| `POSTGRES_PASSWORD` | db | `mining_secret` | Database password |
| `POSTGRES_DB` | db | `mineguard` | Database name |
| `DATABASE_URL` | backend | `postgresql://postgres:mining_secret@db:5432/mineguard` | SQLAlchemy connection string |
| `GOOGLE_CLOUD_PROJECT` | backend | `mine-guard-506610` | GCP project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | backend | `/app/gee-key.json` | Path to service account key |
| `API_PUBLIC_URL` | backend | `http://localhost:8001` | Public URL for artifact links |

### Required Files

- `backend/gee-key.json` — Google Earth Engine service account key (not in repo)

### Ports

| Service | Internal | External | URL |
|---------|----------|----------|-----|
| Frontend | 80 | 3000 | `http://localhost:3000` |
| Backend | 8000 | 8001 | `http://localhost:8001/docs` |
| Database | 5432 | 5433 | PostgreSQL connection |

---

## 6. Dependencies

### Python (`requirements.txt`)

| Package | Purpose |
|---------|---------|
| `fastapi` | Web framework |
| `uvicorn` | ASGI server |
| `python-multipart` | File upload support |
| `sqlalchemy` | ORM |
| `psycopg2-binary` | PostgreSQL driver |
| `geoalchemy2` | PostGIS geometry support |
| `earthengine-api` | Google Earth Engine SDK |
| `geemap` | GEE mapping utilities |
| `numpy` | Numerical computation |
| `pandas` | Data manipulation |
| `scipy` | Scientific computing |
| `fpdf` | PDF generation |
| `shapely` | Geometry operations |
| `geopandas` | Geospatial dataframe |
| `plotly` | Interactive plotting |
| `rasterio` | Raster data I/O |

### Frontend (`package.json`)

| Package | Purpose |
|---------|---------|
| `react` / `react-dom` | UI framework |
| `axios` | HTTP client |
| `lucide-react` | Icons |
| `clsx` | Conditional classNames |
| `tailwind-merge` | Tailwind class deduplication |
| `tailwindcss` | CSS framework (v4) |
| `vite` | Build tool |
| `eslint` | Linting |

---

## 7. Known Issues & Gaps

### Missing Modules
- **`phase2_tin_viz.py`** — 3D TIN visualization generator. Imported in `phase1_detection.py:8` with try/except fallback. Without it, no 3D model is generated.
- **`report_generator.py`** — PDF report generator. Imported in `phase1_detection.py:9` with try/except fallback. Without it, no PDF report is generated.
- Neither module is present in the repository.

### README vs Code Discrepancy
- The README describes a **"Quad-Lock"** system with 4 locks (including Sentinel-1 SAR radar). The code only implements **3 locks** (Optical + NDVI + DEM depth). No SAR/radar data is used anywhere in the codebase.

### Hardcoded Values
- **API URL** in `frontend/src/api.js:3` is hardcoded to `http://localhost:8001`. Would need to be changed for production deployment.
- **GCP Project ID** is hardcoded in `phase1_detection.py:15`.
- **Service account email** is hardcoded in `phase1_detection.py:65`.

### Security
- **No authentication** on any API endpoint.
- **Database credentials** are in plaintext in `docker-compose.yml`.
- **CORS** allows all origins (`*`).

### Deprecated APIs
- `@app.on_event("startup")` and `@app.on_event("shutdown")` in `server.py` are deprecated in FastAPI ≥0.93. Should migrate to `lifespan` context manager.

### Code Quality
- `phase1_detection.py:120` has unreachable code after `raise Exception(...)` — `return False` will never execute.
- `phase1_detection.py:173-186` has inconsistent indentation in the Triple-Lock fusion section.
- No type hints on most functions.
- No unit tests present in the repository.
- No `.env` file — all configuration is in `docker-compose.yml`.

### Missing Features (from README)
- **SMTP alerting** — mentioned in README but not implemented in code.
- **Historical timeline slider** — README mentions year-over-year comparison but not in frontend.
- **UUID-based encrypted pipeline** — UUIDs are used for job IDs but no encryption is implemented.

---

## 8. Recommendations

### High Priority
1. **Add `phase2_tin_viz.py` and `report_generator.py`** to the repository — these are critical for core features.
2. **Remove hardcoded API URL** from `api.js` — use environment variable or Vite proxy config.
3. **Add authentication** to API endpoints (API key or JWT).
4. **Move secrets** to `.env` file (excluded from git) instead of hardcoding in `docker-compose.yml`.

### Medium Priority
5. **Migrate** from deprecated `@app.on_event` to FastAPI `lifespan`.
6. **Fix unreachable code** in `phase1_detection.py:120`.
7. **Fix indentation** in Triple-Lock fusion section (`phase1_detection.py:173-186`).
8. **Add unit tests** for `file_processor.py` and API endpoints.
9. **Update README** to accurately reflect implemented features (3-lock, not 4-lock).

### Low Priority
10. **Add type hints** to Python functions.
11. **Implement SMTP alerting** for high-risk detections.
12. **Add a Vite proxy** for API calls in development to avoid CORS issues.
13. **Consider adding** Sentinel-1 SAR integration as described in the README.
14. **Add error boundaries** in React for better frontend error handling.

---

*Report generated from codebase analysis of Mineguard-main.*
