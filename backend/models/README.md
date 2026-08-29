# Models

`rf_model_v3.pkl` is **not** in version control — it is ~208 MB, above GitHub's
100 MB per-file limit.

## Getting the model

Place `rf_model_v3.pkl` in this directory. `docker-compose.yml` mounts it
read-only at `/app/models`, so no image rebuild is needed to swap it:

```yaml
volumes:
  - ./backend/models:/app/models:ro
```

Point elsewhere with `MG_ML_MODEL_PATH`.

## Contract

The classifier must be a scikit-learn estimator exposing `predict_proba` and
`feature_names_in_` exactly equal to:

```
["B4", "B3", "B2", "B8", "B11", "ndbi", "ndvi", "depth"]
```

`ml_detector.load_model()` validates this on load and raises if it differs,
rather than scoring silently against mismatched columns.

Trained by `mineguard.ipynb` on the Maus et al. 2022 global mining polygons.
`depth` must be built with a **250 m** focal radius to match training — set
`MG_DEPTH_RADIUS=250` (already the default in `docker-compose.yml`).

Running without a model is fine: use `MG_DETECTOR=rule` for the
threshold detector, which needs no `.pkl`.
