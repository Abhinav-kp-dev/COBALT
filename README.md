
# 🛸 MineGuard.ai: Autonomous Geospatial Forensics
> 
## 📌 Overview
Illegal mining is a global crisis, causing $12B+ in economic losses and devastating environmental damage. Traditional monitoring is slow, dangerous, and easily evaded. 

**MineGuard.ai** turns the tide by providing an autonomous, high-confidence forensic pipeline. By fusing optical and topographical satellite data, we detect illegal encroachments and calculate stolen volumes in real-time, providing authorities with "court-ready" digital evidence.

## 🚀 Dual-Detector Verification
MineGuard runs two independent detectors over the same evidence and lets you compare them.

**Triple-Lock thresholds** (`MG_DETECTOR=rule`, default) - a pixel is mining only if all three agree:

1.  **Lock 1: Optical Signature (Sentinel-2)** - bare-soil index NDBI > 0.15.
2.  **Lock 2: Biological Signature (Sentinel-2)** - vegetation index NDVI < 0.20.
3.  **Lock 3: Topographical Forensics (Copernicus DEM)** - a focal-mean surface minus the real DEM identifies physical pits deeper than 2 m.

**RandomForest classifier** (`MG_DETECTOR=ml`) - 500 trees over the same eight
features (B4, B3, B2, B8, B11, NDBI, NDVI, depth), trained on the Maus et al.
2022 global mining polygons. Decision threshold is deliberately precision-
weighted; see `ml_detector.py` for the measured separation by threshold.

## ✨ Key Features
-   **Immersive 3D Modeling**: Generates volumetric meshes of mining pits for tactical inspection.
-   **Precision Quantics**: Automatic calculation of Area (m²), Stolen Volume (m³), and Logistics Load (Total Truckloads).
-   **Enterprise Portal**: Sleek, glassmorphic "Command Center" UI designed for professional mission control.

## ⚙️ Additional Capabilities
-   **Multi-Format Data Ingest**: Seamless support for **zipped ESRI Shapefiles, KML, and GeoJSON**, allowing immediate integration with existing legacy government data.
-   **Forensic PDF Generation**: Automatically generates detailed technical reports including timestamped evidence, metrics summaries, and site coordinates for official use.
-   **Encrypted Pipeline**: Secure data handling with UUID-based job tracking and PostGIS spatial indexing for fast, encrypted retrieval.
-   **Custom Temporal Windows**: Users can select custom `Start` and `End` dates, so the Sentinel-2 composite can target a specific dry season or suspicious window.

## 🧩 Technical Edge
-   **Focal-Mean Smoothing**: We utilize a custom spatial smoothing algorithm on the **Copernicus GLO30 DEM** to reconstruct hypothetical "pre-mining" terrain for high-accuracy volume calculation.
-   **Microservice Architecture**: Fully containerized using **Docker Compose**, separating the heavy-weight GEE engine from the responsive React UI for maximum stability.
-   **Frontend**: React 19, Tailwind CSS v4, Lucide Icons, Framer Motion.
-   **Backend**: Python, FastAPI, SQLAlchemy, PostgreSQL (PostGIS).
-   **Intelligence**: Google Earth Engine (GEE), Geemap, NumPy.
-   **DevOps**: Docker, Nginx, Docker-Compose.

## 🚦 Getting Started (Hackathon Rapid Deploy)

### 1. Requirements
-   Docker Desktop installed.
-   Earth Engine Service Account Key (`gee-key.json`) placed in `./backend/`.

### 2. Magic Command
```bash
docker-compose up -d --build
```

### 3. Access
-   **The Portal**: `http://localhost:3000`
-   **The Engine (API)**: `http://localhost:8000/docs`

## � Business Impact & Sustainability
-   **Environmental Protection**: Real-time detection stops deforestation before it scales.
-   **Revenue Recovery**: Enables governments to tax/fine unauthorized extraction based on precise volumetric data.
-   **Scalability**: Global coverage with zero on-ground hardware required.

---
| *Orbital Intelligence for Global Sustainability*

# Mineguard

## 🔧 Configuration

All detection parameters are environment-overridable; defaults are set in `docker-compose.yml`.

| Variable | Default | Purpose |
|---|---|---|
| `MG_DETECTOR` | `rule` | `rule` (thresholds) or `ml` (RandomForest). The UI sends this per request. |
| `MG_ML_THRESHOLD` | `0.99` | P(mining) cut-off. Precision-weighted; see `ml_detector.py`. |
| `MG_ML_MODEL_PATH` | `models/rf_model_v3.pkl` | Classifier location. |
| `MG_DEPTH_RADIUS` | `150` | Focal radius for the pre-mining surface. **Set 250 for the ML path** to match training. |
| `MG_OPTICAL_THRESHOLD` | `0.15` | NDBI bare-soil gate. |
| `MG_NDVI_THRESHOLD` | `0.20` | NDVI vegetation gate. |
| `MG_MIN_DEPTH` | `2.0` | Minimum pit depth, metres. |
| `MG_ML_SCALE` | `20` | Raster resolution for ML inference, metres. |

The `.pkl` is not in this repo (208 MB, over GitHub's limit) — see
`backend/models/README.md`. The threshold detector runs without it.

## 🧪 Test Sites

| File | Expected |
|---|---|
| `jharia_mining.geojson` | Jharia coalfield — strong detection |
| `test_lease.geojson` | Ballari lease — detected by thresholds; the classifier does not separate it from bare terrain |
| `control_reservoir.geojson` | Open water — clean (JRC permanent water 95.7%) |
| `control_water.geojson` | Named for a reservoir but sits on dry scrubland; **not a valid water control** |

## ⚠️ Known Limitations

- The classifier's training negatives were sampled globally and contain no
  hard negatives near mines, so it cannot separate bare dry scrubland from
  mining. On the Maus independent validation set it scores 0.69 ROC-AUC; the
  higher figures from the random train/test split are inflated by
  multiple sample points falling inside the same mining polygon.
- The 3D model applies percentile clamping and mean smoothing for display
  only. Area and volume are computed from the unfiltered raster.
- Depth is derived from a static DEM, so it reflects terrain relief rather
  than change over the selected date window.
