
# COBALT

**Satellite forensics for illegal mining detection and volumetric assessment**

Quantifies extraction beyond a permitted lease boundary from public satellite
imagery and elevation data — returning area, volume, depth and a signed
forensic report.


---

## Contents

- [The problem](#the-problem)
- [What COBALT does](#what-cobalt-does)
- [Detection methodology](#detection-methodology)
- [Generated artefacts](#generated-artefacts)
- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [Web application](#web-application)
- [Platform assistant](#platform-assistant)
- [Measurements and units](#measurements-and-units)
- [Project structure](#project-structure)
- [Limitations](#limitations)
- [Tech stack](#tech-stack)

---

## The problem

Mining leases grant the right to extract within a defined polygon. Extraction
outside that polygon is theft of public mineral resources, and it is difficult
to police: sites are remote, boundaries are invisible on the ground, and
physical inspection is slow, expensive and hazardous.

Satellite imagery makes the evidence available — but raw imagery is not
evidence. An enforcement body needs a defensible number: *how much* material
was removed, from *how much* ground, *outside* the boundary, over *what*
period.

COBALT produces that number, and shows its work.

---

## What COBALT does

Upload a lease boundary. COBALT composites cloud-filtered Sentinel-2 imagery
over your chosen window, reconstructs the pre-mining land surface from a
digital elevation model, classifies disturbed ground with two independent
detectors, splits the result against the lease polygon, and quantifies what
lies outside it.

```
Lease boundary (KML / GeoJSON / Shapefile)
        │
        ▼
┌───────────────────────────────────────────────────────────┐
│  1. ACQUIRE      Sentinel-2 SR median composite           │
│                  cloud cover < 20%, over date window      │
├───────────────────────────────────────────────────────────┤
│  2. RECONSTRUCT  Copernicus GLO-30 DEM                    │
│                  focal-mean surface − actual terrain      │
│                  = depth below hypothetical pre-mining lid│
├───────────────────────────────────────────────────────────┤
│  3. CLASSIFY     Threshold triple-lock  ─┐                │
│                  RandomForest (500 trees)─┴─► ensemble    │
├───────────────────────────────────────────────────────────┤
│  4. SPLIT        inside lease  = authorised               │
│                  outside lease = deviation                │
├───────────────────────────────────────────────────────────┤
│  5. QUANTIFY     area (m²) · volume (m³) · mean depth (m) │
├───────────────────────────────────────────────────────────┤
│  6. RENDER       2D map · 3D model · PDF report           │
└───────────────────────────────────────────────────────────┘
        │
        ▼
PostGIS record + three artefacts
```

A 2 km buffer is searched around the lease, so encroachment immediately
adjacent to the boundary is captured rather than clipped away.

---

## Detection methodology

COBALT does not ask you to choose a detector. **Every scene is assessed twice,
by two methods with independent failure modes, on an identical pixel grid.**

### Engine 1 — Threshold triple-lock

A pixel is mining only if all three physical signatures agree:

| Lock | Signal | Test | Rationale |
|:--|:--|:--|:--|
| **1 — Optical** | NDBI (Sentinel-2 B11/B8) | `> 0.15` | Exposed bare soil |
| **2 — Biological** | NDVI (Sentinel-2 B8/B4) | `< 0.20` | Absence of vegetation |
| **3 — Topographic** | DEM focal-mean − DEM | `> 2.0 m` | A physical pit exists |

NDBI alone confuses urban land and fallow fields with mines; the vegetation
gate removes most of that, and the depth gate removes the rest. Bare ground
with no excavation cannot pass all three.

### Engine 2 — RandomForest classifier

500 trees over eight features — `B4, B3, B2, B8, B11, NDBI, NDVI, depth` —
trained on the [Maus et al. 2022](https://doi.org/10.1038/s41597-022-01547-4)
global mining polygons.

The decision threshold is deliberately precision-weighted at **P ≥ 0.99**. The
model was trained against a globally-sampled negative set with no hard
negatives, so it is over-confident: at P ≥ 0.5 it flags ~97% of every scene.
Measured mine-to-control separation across the benchmark sites:

| Threshold | 0.90 | 0.95 | 0.97 | 0.98 | **0.99** |
|:--|:--|:--|:--|:--|:--|
| Separation | 1.8× | 3.1× | 5.2× | 8.5× | **21.3×** |

In an enforcement context a false accusation costs far more than a missed pit.

### The ensemble

Both engines run on the same `computePixels` fetch — the threshold mask is
carried as an extra band, so the two are pixel-aligned with no resampling or
alignment guesswork.

- **Reported finding = union.** A pixel counts if *either* engine flags it, so
  a miss by one method cannot hide a site the other caught.
- **Confidence = intersection.** The overlap is published as a
  **cross-validation agreement score** on every report — one number, rather
  than two competing results the reader must reconcile.

If the model file is unavailable, the pipeline degrades gracefully to
threshold-only rather than failing the request.

---

## Generated artefacts

Every assessment produces three deliverables, served from
`/static/outputs/<job_id>/`.

| Artefact | File | Description |
|:--|:--|:--|
| **3D forensic model** | `model_3d.html` | Interactive Plotly surface of the excavation, cut into standard open-cast bench terraces, with a stated vertical exaggeration |
| **Annotated map** | `map_2d.html` | Sentinel-2 basemap with detection overlay, lease boundary, and a toggleable "confirmed by both methods" layer |
| **Forensic report** | `report.pdf` | Timestamped PDF: metadata, provenance, executive summary, detection metrics, severity assessment |

### A note on the 3D model

Metre-scale pits across kilometre-scale leases are nearly flat, so vertical
exaggeration is unavoidable — but it is **capped at 200×, and printed on the
figure**. The scene is also cropped to the excavation rather than rendering
kilometres of undisturbed ground, and horizontal proportions are true to
ground so plan-view distances are not misleading.

---

## Quick start

```bash
git clone https://github.com/Abhinav-kp-dev/COBALT.git
cd COBALT
docker compose up -d --build
```

| Service | URL | Notes |
|:--|:--|:--|
| Web application | http://localhost:3000 | React UI |
| API | http://localhost:8001 | FastAPI |
| API docs | http://localhost:8001/docs | OpenAPI / Swagger |
| Database | `localhost:5433` | PostGIS |

The backend waits ~10 s for Postgres, initialises the schema, then starts
Uvicorn. First boot takes a little longer while Earth Engine authenticates.

```bash
docker compose logs -f backend    # watch startup
docker compose down               # stop
```

> **Earth Engine credentials are required before first run.** See below.

---

## Prerequisites

### 1. Google Earth Engine access

Free, and required — all imagery and elevation data is fetched through it.
Full walkthrough in **[GEE_SETUP.md](GEE_SETUP.md)**. In short:

1. Register at <https://code.earthengine.google.com/register>
2. Authenticate on the host machine:
   ```bash
   pip install earthengine-api
   earthengine authenticate
   ```
3. `docker-compose.yml` mounts `~/.config/earthengine` read-only into the
   container, so the container reuses your host login.

Alternatively, place a service-account key at `backend/gee-key.json`
(gitignored) and set `GOOGLE_CLOUD_PROJECT` to your own project ID.

### 2. Classifier model (optional)

`backend/models/rf_model_v3.pkl` is **not in version control** — it is ~208 MB,
above GitHub's 100 MB per-file limit. It is mounted as a volume, so swapping it
needs no image rebuild.

Without it COBALT still runs, using the threshold engine alone. See
[`backend/models/README.md`](backend/models/README.md) for the model contract.

---

## Configuration

All tuning is environment-driven — no code edits needed to retune a site.
Defaults are calibrated against Sentinel-2 medians (Jan–Apr 2024) over the
Jharia coalfield, a Ballari iron-ore lease, and a bare-ground control.

### Detection

| Variable | Default | Description |
|:--|:--|:--|
| `MG_DETECTOR` | `ensemble` | Escape hatch only. Set `rule` to force threshold-only |
| `MG_CLOUD_THRESHOLD` | `20` | Max scene cloud cover (%) |
| `MG_OPTICAL_THRESHOLD` | `0.15` | NDBI bare-soil gate |
| `MG_NDVI_THRESHOLD` | `0.20` | NDVI vegetation gate |
| `MG_MIN_DEPTH` | `2.0` | Minimum pit depth (m) |
| `MG_DEPTH_RADIUS` | `250` *(compose)* | Focal radius (m) for surface reconstruction. Code default is `150` — Compose overrides it to `250` |
| `MG_CLEANUP_RADIUS` | `30` | Majority-filter despeckle radius (m) |

> ⚠️ `MG_DEPTH_RADIUS` **must match the radius the classifier was trained
> with (250 m)**. A mismatch makes every depth value at inference smaller than
> the model expects.

### Classifier

| Variable | Default | Description |
|:--|:--|:--|
| `MG_ML_THRESHOLD` | `0.99` | Decision threshold. Lower to `0.95` for more recall |
| `MG_ML_SCALE` | `20` | Fetch resolution (m/px) |
| `MG_ML_MAX_PIXELS` | `4000000` | Response cap; larger regions auto-coarsen |
| `MG_ML_MODEL_PATH` | `models/rf_model_v3.pkl` | Classifier location |

### Infrastructure

| Variable | Default | Description |
|:--|:--|:--|
| `API_PUBLIC_URL` | `http://localhost:8001` | Base URL baked into artefact links |
| `GOOGLE_CLOUD_PROJECT` | `monarch-507004` | Earth Engine project ID |
| `DATABASE_URL` | *(see compose)* | PostGIS connection string |

> **Deploying beyond localhost:** set `API_PUBLIC_URL` to the reachable host
> before running analyses. Artefact URLs are persisted at write time, so
> records created under the wrong value will point at unreachable files.

---

## API reference

Interactive documentation at `/docs`.

### `GET /`
Service health. Returns status and the configured public URL.

### `POST /api/analyze`
Run an assessment. `multipart/form-data`:

| Field | Type | Required | Default |
|:--|:--|:--|:--|
| `file` | `.zip` / `.kml` / `.geojson` | ✅ | — |
| `start_date` | `YYYY-MM-DD` | — | `2024-01-01` |
| `end_date` | `YYYY-MM-DD` | — | `2024-04-30` |

```bash
curl -X POST http://localhost:8001/api/analyze \
  -F "file=@lease.geojson" \
  -F "start_date=2024-01-01" \
  -F "end_date=2024-04-30"
```

```jsonc
{
  "status": "success",
  "detector": "ensemble",
  "job_id": "2f0bb33f",
  "metrics": {
    "illegal_area_m2": 7394000.0,   // deviation area outside the lease
    "legal_area_m2":   3826800.0,   // authorised extraction inside it
    "volume_m3":      38491431.1,   // unauthorised material removed
    "total_vol_m3":   54867886.94,
    "avg_depth_m":           5.21,  // volume ÷ area
    "agreement_pct":         0.2    // cross-validation between engines
  },
  "urls": { "report": "…/report.pdf", "map": "…/map_2d.html", "3d_model": "…/model_3d.html" }
}
```

Returns `400` if no valid boundary can be read from the file — COBALT fails
loudly rather than silently analysing a placeholder location.

### `POST /api/chat`
Ask the platform assistant. `{ "messages": [{ "role": "user", "content": "…" }] }`
where `role` is `user` or `model`. Returns `{ "reply": "…" }`, or `503` with a
readable reason when the assistant is unconfigured or upstream fails.

### `GET /api/chat/status`
Whether the assistant is available: `{ "enabled": bool, "model": str }`.

### `GET /api/history`
All assessments, newest first.

### `DELETE /api/inspections/{id}`
Delete one assessment and purge its artefacts from disk.

### `POST /api/inspections/delete`
Bulk delete: `{ "ids": [1, 2, 3] }`

---

## Web application

Six sections behind a fixed sidebar, with real shareable URLs
(`#/reports/2f0bb33f`) and a working back button.

| Section | Purpose |
|:--|:--|
| **Overview** | Aggregate position, severity distribution, largest extractions, open alerts |
| **New Analysis** | Drag-and-drop boundary upload, acquisition window, live pipeline status |
| **Inspection History** | Sortable / filterable table with multi-select and bulk delete |
| **Reports** | Record picker beside a tabbed 3D / map / PDF viewer |
| **Alerts** | Findings crossing the reporting threshold, with acknowledge and reopen |
| **Settings** | Threshold, analysis defaults, live service status, detection constants |

**Alerts are derived, not stored.** An alert *is* an inspection whose deviation
area crosses the operator's configured threshold. Deriving them means the feed
cannot drift out of sync with the findings, and changing the threshold
re-evaluates the entire history immediately.

**Theming.** Light and dark palettes swap on a single `data-theme` attribute.
Follows the OS preference on first load, then remembers the explicit choice.
All secondary text was contrast-measured and clears **WCAG AA (≥ 4.5:1) in both
themes**.

---

## Platform assistant

An optional in-app chatbot, backed by the **Google AI Studio (Gemini) API**,
that answers two kinds of question:

- **How the platform works** — methodology, units, thresholds, workflow.
- **What your data currently says** — grounded in a live summary of the
  inspection table, so *"how many sites are over threshold?"* is answered from
  the database rather than guessed.

### Enabling it

1. Get a free key at <https://aistudio.google.com/apikey>
2. ```bash
   cp .env.example .env      # .env is gitignored
   # then set GEMINI_API_KEY=... in it
   docker compose up -d backend
   ```

Without a key the assistant is **hidden entirely** — the rest of COBALT is
unaffected. `GET /api/chat/status` reports availability, and the UI only
renders the launcher when it returns `enabled: true`.

| Variable | Default | Description |
|:--|:--|:--|
| `GEMINI_API_KEY` | *(unset)* | AI Studio key. Assistant is hidden when absent |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Must be a model your key can access |

### Design notes

- **The key never reaches the browser.** The frontend calls `POST /api/chat`;
  only the backend process holds `GEMINI_API_KEY`. A key embedded in React
  source is public to anyone who opens devtools.
- **Grounded, not freeform.** Each request carries a curated platform briefing
  plus a live database summary. The model is instructed to answer only from
  those and to say so when it cannot — it must not invent a figure, threshold
  or filename.
- **Rebuilt per request**, so the assistant reflects the current table rather
  than a snapshot from session start.
- **Bounded**: history is trimmed to the last 12 turns and each message capped
  at 4,000 characters, so a runaway client cannot become an unbounded bill.
- **Inspection data is treated as untrusted.** Lease filenames are user-supplied,
  so the system prompt instructs the model to treat that block as data and never
  follow instructions appearing inside it. The request schema also rejects any
  role other than `user`/`model`, so a client cannot inject a forged `system`
  turn.
- **It will not give legal advice.** COBALT produces presumptive evidence; the
  assistant is instructed to say so rather than assert that illegal mining
  occurred.

---
## Measurements and units

Every figure is verified dimensionally consistent:

| Quantity | Unit ladder | Derivation |
|:--|:--|:--|
| Deviation area | m² → ha (÷10⁴) → km² (÷10⁶) | Masked pixel count × pixel area |
| Extracted volume | m³ → Mm³ (÷10⁶) | Depth prism summed over masked pixels |
| Mean pit depth | m | volume ÷ area |
| Haulage equivalent | loads | volume ÷ 15 m³ per truck |

Only excavation *below* the reconstructed surface counts as removed material —
negative depth is a spoil mound, not a pit.

> **Reading the dashboard totals.** A lease can be re-assessed over time, so
> aggregate figures are **cumulative across assessment runs**, not a unique
> ground-area measurement. The Overview shows distinct lease files alongside
> total runs so the difference is explicit rather than implied away.

---

## Project structure

```
COBALT/
├── backend/
│   ├── server.py               FastAPI app, routes, persistence
│   ├── phase1_detection.py     Earth Engine pipeline, ensemble orchestration
│   ├── ml_detector.py          RandomForest inference, map rendering
│   ├── phase2_tin_viz.py       3D forensic surface model
│   ├── report_generator.py     Forensic PDF
│   ├── file_processor.py       Shapefile / KML / GeoJSON ingest
│   ├── models.py · database.py PostGIS ORM
│   └── models/                 Classifier (gitignored, volume-mounted)
├── frontend/
│   └── src/
│       ├── components/         Sidebar, Topbar, UI primitives
│       ├── sections/           The six application sections
│       └── lib/                Store, settings, theme, routing, formatting
├── docker-compose.yml
└── GEE_SETUP.md
```

---

## Limitations

Stated plainly, because an enforcement tool that overstates its confidence is
worse than none.

- **Detection is presumptive, not conclusive.** Output is a prioritisation and
  quantification aid. It is not a substitute for ground survey or legal
  determination.
- **Boundary accuracy bounds everything.** All "outside the lease" figures are
  only as good as the uploaded polygon.
- **DEM temporality.** Copernicus GLO-30 is a fixed snapshot. Depth is measured
  against a reconstructed local surface, not a true pre-mining survey, so
  volumes are estimates — and excavation predating the DEM may be understated.
- **Optical dependence.** Persistent cloud, dense canopy or snow degrades the
  composite. Widening the date window helps.
- **Shallow, spread-out workings are hard.** Artisanal sites near the 2 m depth
  gate may fall below it.
- **Classifier bias.** Trained on a global negative set without hard negatives;
  the P ≥ 0.99 threshold compensates but trades recall for precision.
- **Not hardened for production.** Open CORS, no authentication, and a
  development database password in `docker-compose.yml`. Put it behind a
  gateway and move secrets to a `.env` before any real deployment.

---

## Tech stack

| Layer | Technology |
|:--|:--|
| **Frontend** | React 19 · Vite 7 · Tailwind CSS v4 · Lucide |
| **Backend** | Python 3.11 · FastAPI · Uvicorn · SQLAlchemy · GeoAlchemy2 |
| **Database** | PostgreSQL + PostGIS |
| **Geospatial** | Google Earth Engine · geemap · Shapely · GeoPandas · rasterio |
| **ML / numerics** | scikit-learn · NumPy · SciPy · pandas |
| **Rendering** | Plotly (3D) · Folium (2D) · FPDF (reports) |
| **Assistant** | Google AI Studio (Gemini) via server-side proxy |
| **Infrastructure** | Docker Compose · Nginx |

### Data sources

- **Copernicus Sentinel-2 SR Harmonized** — optical imagery
- **Copernicus DEM GLO-30 (2024)** — elevation
- **Maus et al. (2022)** — global mining polygons, classifier training labels

---

<div align="center">
<sub>COBALT · Satellite mining forensics · Sentinel-2 · Copernicus DEM · Google Earth Engine</sub>
</div>
