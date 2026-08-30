"""
MineGuard: RandomForest pixel classifier.

An alternative to the threshold-based ("triple lock") detector in
phase1_detection.py. Same inputs, same outputs: it consumes the Sentinel-2
bands and DEM the pipeline already fetches, and returns a binary mining mask
plus the depth raster, so every downstream stage (legal/illegal split, area,
volume, 2D map, 3D TIN, PDF) works unchanged.

The forest is 500 unbounded trees, far too large to port into
ee.Classifier.decisionTreeEnsemble -- the tree-string payload would be orders
of magnitude over Earth Engine's request limit. So the raster comes to the
model rather than the model going to Earth Engine: one computePixels fetch,
then scoring locally with numpy.
"""

import os
import ee
import numpy as np

# Feature order is fixed by the trained model's feature_names_in_. Do not
# reorder -- sklearn matches on position, and a silent permutation here would
# produce confident nonsense rather than an error.
MODEL_FEATURES = ["B4", "B3", "B2", "B8", "B11", "ndbi", "ndvi", "depth"]

MODEL_PATH = os.getenv("MG_ML_MODEL_PATH", "models/rf_model_v3.pkl")

# P(mining) above which a pixel is called mining. The model was trained on a
# globally-sampled negative set with no hard negatives, so it is badly
# over-confident: at 0.5 it flags ~97% of every scene, including a site known
# to be clean. Measured mine-to-control separation on the benchmark sites:
#   0.90 -> 1.8x    0.95 -> 3.1x    0.97 -> 5.2x    0.98 -> 8.5x    0.99 -> 21.3x
# 0.99 is deliberately precision-weighted: in an enforcement context a false
# accusation costs far more than a missed pit. Drop to 0.95 for more recall.
ML_THRESHOLD = float(os.getenv("MG_ML_THRESHOLD", 0.99))

# Metres per pixel for the fetched raster. 20 m keeps a 2 km-buffered lease
# comfortably inside computePixels' response limit while staying fine enough
# to resolve pit edges.
ML_SCALE = float(os.getenv("MG_ML_SCALE", 20))

_model = None


def load_model(path=None):
    """Load and cache the classifier. Raises if it cannot be loaded."""
    global _model
    if _model is not None:
        return _model

    path = path or MODEL_PATH
    if not os.path.exists(path):
        raise FileNotFoundError(
            f"ML model not found at '{path}'. Set MG_ML_MODEL_PATH, or run with "
            f"MG_DETECTOR=rule to use the threshold detector."
        )

    try:
        import joblib
    except ImportError as e:
        raise ImportError(
            "joblib/scikit-learn are required for MG_DETECTOR=ml. "
            "Install them or run with MG_DETECTOR=rule."
        ) from e

    print(f"🧠 Loading classifier: {path}")
    model = joblib.load(path)

    trained_on = list(getattr(model, "feature_names_in_", MODEL_FEATURES))
    if trained_on != MODEL_FEATURES:
        raise ValueError(
            f"Model expects features {trained_on}, but this pipeline builds "
            f"{MODEL_FEATURES}. Retrain or update MODEL_FEATURES to match."
        )

    _model = model
    print(f"✅ Classifier ready ({getattr(model, 'n_estimators', '?')} trees, "
          f"threshold {ML_THRESHOLD})")
    return _model


def build_feature_stack(s2_image, raw_depth, roi, dem=None, rule_mask=None):
    """
    Assemble the exact bands the model was trained on, plus the lease-boundary
    mask so the inside/outside split needs no second Earth Engine round-trip.

    Args:
        s2_image: median Sentinel-2 composite carrying B4/B3/B2/B8/B11
        raw_depth: single-band 'depth' image (smoothed surface minus DEM)
        roi: lease boundary geometry
        rule_mask: optional boolean ee.Image (the threshold triple-lock mask)
            fetched as an extra band so it lands on the exact same pixel grid
            as the ML features -- this is what lets the two detectors be
            combined pixel-for-pixel instead of just compared as summary stats.

    Returns:
        ee.Image with bands MODEL_FEATURES + ['boundary'] (+ 'rule_mask' if given)
    """
    ndbi = s2_image.normalizedDifference(["B11", "B8"]).rename("ndbi")
    ndvi = s2_image.normalizedDifference(["B8", "B4"]).rename("ndvi")
    depth = raw_depth.rename("depth")
    boundary = ee.Image.constant(0).byte().paint(roi, 1).rename("boundary")

    stack = (s2_image.select(["B4", "B3", "B2", "B8", "B11"])
             .addBands(ndbi)
             .addBands(ndvi)
             .addBands(depth)
             .addBands(boundary))

    # Real ground elevation, carried for the 3D model only -- never a model
    # feature. Without it the terrain has to be drawn from the depth residual,
    # which swings either side of zero across natural topography and renders
    # flat ground as rolling hills.
    if dem is not None:
        stack = stack.addBands(dem.rename("elevation"))

    if rule_mask is not None:
        stack = stack.addBands(rule_mask.rename("rule_mask"))

    return stack.toFloat()


# computePixels caps the response size, so a large lease is fetched at a
# coarser scale rather than failing outright.
MAX_PIXELS = int(os.getenv("MG_ML_MAX_PIXELS", 4_000_000))


def fetch_array(image, region, scale=None, extra_bands=None):
    """
    Pull an ee.Image into a numpy structured array via computePixels.

    Returns (array, scale_used, bounds). The scale is returned because it may
    be coarsened to fit the response limit, and the area/volume maths
    downstream must use the scale actually fetched; bounds is the
    (west, south, east, north) extent the raster covers, for map overlays.

    extra_bands: additional band names present on `image` to fetch alongside
    the model features (e.g. "rule_mask" for the ensemble path).
    """
    scale = scale or ML_SCALE
    band_names = MODEL_FEATURES + ["boundary", "elevation"] + list(extra_bands or [])

    coords = region.bounds().coordinates().getInfo()[0]
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)

    # Degrees per metre, corrected for latitude so a lease far from the
    # equator is not sampled at the wrong ground resolution.
    mid_lat = (miny + maxy) / 2.0
    deg_y = scale / 111320.0
    deg_x = scale / (111320.0 * max(0.1, np.cos(np.radians(mid_lat))))

    width = int(np.ceil((maxx - minx) / deg_x))
    height = int(np.ceil((maxy - miny) / deg_y))

    if width * height > MAX_PIXELS:
        factor = np.sqrt(width * height / MAX_PIXELS)
        scale = scale * factor
        deg_y, deg_x = deg_y * factor, deg_x * factor
        width = int(np.ceil((maxx - minx) / deg_x))
        height = int(np.ceil((maxy - miny) / deg_y))
        print(f"   ↔️  Region too large; coarsening to {scale:.0f} m")

    request = {
        "expression": image.clip(region),
        "fileFormat": "NUMPY_NDARRAY",
        "bandIds": band_names,
        "grid": {
            "dimensions": {"width": width, "height": height},
            "affineTransform": {
                "scaleX": deg_x, "shearX": 0.0, "translateX": minx,
                "shearY": 0.0, "scaleY": -deg_y, "translateY": maxy,
            },
            "crsCode": "EPSG:4326",
        },
    }

    print(f"   📡 Fetching {width}x{height} raster at {scale:.0f} m...")
    arr = ee.data.computePixels(request)

    if arr is None or arr.size == 0:
        raise RuntimeError("Earth Engine returned an empty raster for this region.")

    print(f"   ✅ Raster {arr.shape} ({arr.size:,} px)")
    return arr, scale, (minx, miny, maxx, maxy)


def predict_mask(arr, model=None, threshold=None):
    """
    Score every pixel and return (mining_mask, depth, boundary, probability),
    all 2-D arrays aligned to the input raster.

    Pixels with any missing feature are scored as background rather than
    imputed -- a guessed reflectance would produce a confident wrong label.
    """
    model = model or load_model()
    threshold = ML_THRESHOLD if threshold is None else threshold

    h, w = arr.shape
    cols = [np.asarray(arr[b], dtype=np.float64).ravel() for b in MODEL_FEATURES]
    X = np.column_stack(cols)

    depth = np.asarray(arr["depth"], dtype=np.float64)
    boundary = np.asarray(arr["boundary"], dtype=np.float64) > 0.5
    elevation = (np.asarray(arr["elevation"], dtype=np.float64)
                 if "elevation" in (arr.dtype.names or ()) else None)

    valid = np.isfinite(X).all(axis=1)
    prob = np.zeros(X.shape[0], dtype=np.float64)

    if valid.any():
        print(f"   🧠 Scoring {valid.sum():,} valid px "
              f"({(~valid).sum():,} skipped as no-data)...")
        # Pass a named frame so sklearn matches columns by name rather than
        # position -- silences the feature-name warning and makes a future
        # reordering of MODEL_FEATURES fail loudly instead of silently.
        import pandas as pd
        prob[valid] = model.predict_proba(
            pd.DataFrame(X[valid], columns=MODEL_FEATURES)
        )[:, 1]

    prob = prob.reshape(h, w)
    mask = (prob >= threshold) & valid.reshape(h, w)

    print(f"   🎯 {mask.mean()*100:.1f}% of pixels above P={threshold}")
    return mask, depth, boundary, prob, elevation


def metrics_from_arrays(mask, depth, boundary, scale=None):
    """
    Area and volume straight from the raster, mirroring what the Earth Engine
    path computes with reduceRegion: area is pixel count times pixel area, and
    volume is the depth prism summed over masked pixels.

    Inside the lease boundary is legal; outside it, within the search buffer,
    is illegal.
    """
    scale = scale or ML_SCALE
    px_area = float(scale) ** 2

    legal = mask & boundary
    illegal = mask & ~boundary

    def area_vol(m):
        if not m.any():
            return 0.0, 0.0
        d = np.where(np.isfinite(depth), depth, 0.0)[m]
        # Only excavation below the reconstructed surface counts as removed
        # material; negative depth is a mound, not a pit.
        return float(m.sum()) * px_area, float(np.clip(d, 0, None).sum()) * px_area

    legal_area, legal_vol = area_vol(legal)
    illegal_area, illegal_vol = area_vol(illegal)

    return {
        "legal_area_m2": legal_area,
        "legal_vol_m3": legal_vol,
        "illegal_area_m2": illegal_area,
        "illegal_vol_m3": illegal_vol,
        "avg_depth_m": (illegal_vol / illegal_area) if illegal_area > 0 else 0.0,
    }


def run_ml_detection(s2_image, raw_depth, roi, search_zone, scale=None, dem=None):
    """
    Full ML path: build the stack, fetch it, score it, and reduce to metrics.
    Returns the metrics dict plus the raw arrays for anything downstream.
    """
    stack = build_feature_stack(s2_image, raw_depth, roi, dem=dem)
    arr, scale_used, bounds = fetch_array(stack, search_zone, scale or ML_SCALE)
    mask, depth, boundary, prob, elevation = predict_mask(arr)
    metrics = metrics_from_arrays(mask, depth, boundary, scale_used)
    return metrics, {"mask": mask, "depth": depth, "boundary": boundary,
                     "prob": prob, "bounds": bounds, "scale": scale_used,
                     "elevation": elevation}


def run_ensemble_detection(s2_image, raw_depth, roi, search_zone, rule_mask,
                            scale=None, dem=None):
    """
    Run the RandomForest classifier and the threshold triple-lock together on
    the exact same pixel grid, and combine them into one detection instead of
    presenting two competing results:

      - "combined" mask (what gets reported): a pixel counts as mining if
        EITHER method flags it -- a miss by one method doesn't hide a real
        site the other one caught.
      - "confirmed" mask (both agree): the subset the two independent methods
        agree on, reported as a cross-validation confidence percentage rather
        than a second number the user has to reconcile.

    `rule_mask` must be the same boolean ee.Image (the threshold triple-lock
    mask) the rule pipeline already computed, fetched here as an extra band so
    it lands on the identical grid as the ML features -- no separate
    reduceRegion, no alignment guesswork.
    """
    stack = build_feature_stack(s2_image, raw_depth, roi, dem=dem, rule_mask=rule_mask)
    arr, scale_used, bounds = fetch_array(
        stack, search_zone, scale or ML_SCALE, extra_bands=["rule_mask"]
    )
    ml_mask, depth, boundary, prob, elevation = predict_mask(arr)
    rule_mask_arr = np.asarray(arr["rule_mask"], dtype=np.float64) > 0.5

    combined_mask = ml_mask | rule_mask_arr
    confirmed_mask = ml_mask & rule_mask_arr

    metrics = metrics_from_arrays(combined_mask, depth, boundary, scale_used)
    combined_count = int(combined_mask.sum())
    agreement_pct = (float(confirmed_mask.sum()) / combined_count * 100.0) if combined_count else 0.0
    print(f"   🤝 Cross-validation agreement: {agreement_pct:.1f}% "
          f"({int(confirmed_mask.sum()):,} confirmed / {combined_count:,} flagged px)")

    return metrics, {
        "mask": combined_mask, "confirmed_mask": confirmed_mask,
        "ml_mask": ml_mask, "rule_mask": rule_mask_arr,
        "depth": depth, "boundary": boundary, "prob": prob, "bounds": bounds,
        "scale": scale_used, "elevation": elevation,
        "agreement_pct": agreement_pct,
    }


# --- MAP RENDERING -------------------------------------------------------
# The classifier's verdict lives in a numpy array, not in Earth Engine, so it
# cannot be drawn with Map.addLayer like the rule masks. Instead the mask is
# rendered to a transparent PNG and laid over the basemap at its true extent.

DETECTION_RGBA = {
    "illegal": (255, 0, 0, 200),
    "legal": (0, 255, 0, 190),
}


def mask_to_png_datauri(mask, boundary):
    """
    Render the detection mask as a transparent RGBA PNG data URI.

    Red is detected-and-outside-the-lease, green is detected-and-inside.
    Everything else stays fully transparent so the basemap shows through.
    """
    import base64
    import io
    from PIL import Image

    h, w = mask.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[mask & ~boundary] = DETECTION_RGBA["illegal"]
    rgba[mask & boundary] = DETECTION_RGBA["legal"]

    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG", optimize=True)
    encoded = base64.b64encode(buf.getvalue()).decode("ascii")
    print(f"   🖼️  Overlay PNG {w}x{h} ({len(encoded)//1024} KB)")
    return f"data:image/png;base64,{encoded}"


def build_detection_map(s2_image, lease_geojson, arrays, output_path):
    """
    Build the 2D map for the (ML + threshold) ensemble detection.

    Deliberately does not reuse the geemap path: those layers render the
    rule-only masks, which would contradict the combined metrics this
    pipeline produced -- on a clean site the map would show red while the
    report says nothing was found.
    """
    import folium

    west, south, east, north = arrays["bounds"]
    centre = [(south + north) / 2.0, (west + east) / 2.0]

    fmap = folium.Map(location=centre, zoom_start=14, tiles=None,
                      control_scale=True)

    # True-colour Sentinel-2 basemap, served as Earth Engine tiles.
    try:
        mapid = s2_image.getMapId(
            {"min": 0, "max": 3000, "bands": ["B4", "B3", "B2"]}
        )
        folium.TileLayer(
            tiles=mapid["tile_fetcher"].url_format,
            attr="Google Earth Engine / Copernicus Sentinel-2",
            name="Satellite",
            overlay=False,
            control=True,
        ).add_to(fmap)
    except Exception as e:
        print(f"   ⚠️  Could not attach EE basemap ({e}); using OpenStreetMap")
        folium.TileLayer("OpenStreetMap", name="Basemap").add_to(fmap)

    folium.raster_layers.ImageOverlay(
        image=mask_to_png_datauri(arrays["mask"], arrays["boundary"]),
        bounds=[[south, west], [north, east]],
        opacity=0.75,
        name="Detections (Threshold + ML)",
        interactive=False,
        zindex=2,
    ).add_to(fmap)

    # The subset both independent detectors agree on -- toggle this layer on
    # to see the high-confidence core of the detection above, as visual proof
    # the two methods are corroborating rather than contradicting each other.
    confirmed = arrays.get("confirmed_mask")
    if confirmed is not None and confirmed.any():
        folium.raster_layers.ImageOverlay(
            image=mask_to_png_datauri(confirmed, arrays["boundary"]),
            bounds=[[south, west], [north, east]],
            opacity=0.9,
            name=f"Confirmed by Both Methods ({arrays.get('agreement_pct', 0):.0f}% agreement)",
            interactive=False,
            show=False,
            zindex=3,
        ).add_to(fmap)

    folium.GeoJson(
        lease_geojson,
        name="Lease Boundary",
        style_function=lambda _: {
            "color": "#1e90ff", "weight": 3, "fill": False,
        },
    ).add_to(fmap)

    folium.LayerControl(collapsed=False).add_to(fmap)
    fmap.save(output_path)
    print(f"   ✅ 2D map saved: {output_path}")
