"""
MineGuard Phase 2: 3D Forensics Surface Model

Generates an interactive 3D forensic excavation model using Plotly.
Renders excavation pit depth downwards (negative Z), with a calibrated white-to-crimson
gradient, projected 2D floor contours, and dark forensic theme matching the MineGuard UI.
"""

import os
import numpy as np
from scipy.ndimage import (uniform_filter, gaussian_filter, binary_dilation,
                           binary_closing, grey_closing)
import scipy.interpolate as interp
import plotly.graph_objects as go


def _generate_empty_model(output_path):
    """Generate a placeholder HTML when 3D model cannot be created."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>MineGuard 3D Model</title></head>
    <body style="background:#070a10; color:#f8fafc; display:flex; align-items:center; 
                 justify-content:center; height:100vh; margin:0; font-family:system-ui,-apple-system,sans-serif;">
        <div style="text-align:center;">
            <h2>🛸 3D Model Unavailable</h2>
            <p style="color:#94a3b8;">Insufficient excavation data to generate 3D forensic model.</p>
        </div>
    </body>
    </html>
    """
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"   ⚠️ Placeholder model saved: {output_path}")


# Anything shallower than this is DEM noise, not excavation. Zeroing it keeps
# the undisturbed terrain rendering as one flat white lid, so the detected pits
# read as sharp funnels instead of drowning in a bumpy grey field.
NOISE_FLOOR_M = 0.75

# Open-cast mines are not smooth cones: they are cut as a staircase of benches
# (flat working terraces separated by steep risers) so haul trucks can drive in
# and the walls stay stable. Quantising the depth into these levels is what
# makes the render read as an engineered excavation rather than a soft crater.

# How hard the terraces are cut. 1.0 = pure staircase (aliased, harsh),
# 0.0 = fully smooth. Blending keeps crisp risers with clean bench faces.
BENCH_SHARPNESS = 0.82

# Bench heights actually used in open-cast practice, in metres. Snapping to one
# of these (rather than just dividing the depth into N equal parts) keeps the
# quoted figure plausible to anyone who works these sites.
STANDARD_BENCH_HEIGHTS = (0.5, 1.0, 2.0, 2.5, 5.0, 7.5, 10.0, 15.0, 20.0, 25.0)


def _nice_bench_height(peak, target_benches=8):
    """Pick a real-world bench height giving roughly `target_benches` terraces."""
    if peak <= 0:
        return 0.0
    raw = peak / float(target_benches)
    for h in STANDARD_BENCH_HEIGHTS:
        if raw <= h:
            return h
    return 30.0


def _apply_benches(d, sharpness=BENCH_SHARPNESS):
    """
    Quantise pit depths into discrete bench levels.

    Returns (benched_depth, bench_height_m). Undisturbed ground (0.0) is
    untouched -- floor(0) stays 0 -- so the lid never picks up a false step.
    """
    peak = float(np.nanmax(d)) if d.size else 0.0
    if peak <= 0:
        return d, 0.0

    bench_h = _nice_bench_height(peak)
    stepped = np.floor(d / bench_h + 1e-9) * bench_h
    return sharpness * stepped + (1.0 - sharpness) * d, bench_h


def _build_pit_surface(depth, mask=None, smooth=2.2):
    """
    Turn a raw depth raster into the forensic pit surface.

    Outside the detection mask the surface is pinned to exactly 0.0 (the
    reconstructed pre-mining lid); inside it, the depth prism is kept and
    smoothed into a continuous basin rather than a field of isolated pixel
    spikes -- scattered single-pixel detections (common with a sparse ML
    mask) are fused into one landform by dilating the mask before smoothing,
    so the model reads as excavated terrain, not a pincushion.

    Args:
        depth: 2D array of positive depths in metres (0 = undisturbed)
        mask: optional boolean array, True where mining was detected
        smooth: gaussian sigma applied to the retained pit depths

    Returns:
        (Z, bench_h) -- Z is a 2D array of values <= 0.0 with undisturbed
        ground at exactly 0.0; bench_h is the terrace height in metres, used
        downstream to align the contour spacing to the bench risers.
    """
    d = np.asarray(depth, dtype=np.float64)
    d = np.where(np.isfinite(d), d, 0.0)
    d = np.clip(d, 0.0, None)

    if mask is not None:
        m = np.asarray(mask)
        if m.shape == d.shape:
            m = m.astype(bool)
            # Close first: bridging the gaps between neighbouring detections
            # merges a scatter of separate holes into contiguous pit bodies
            # WITHOUT eating into the depths the way heavy blurring does.
            m = binary_closing(m, iterations=4)
            # Then a light dilation for the rim, so each pit wall has somewhere
            # to climb back up to the undisturbed lid.
            m = binary_dilation(m, iterations=2)
            d = np.where(m, d, 0.0)

    # Drop sub-noise-floor residual before smoothing so it cannot bleed outward.
    d = np.where(d >= NOISE_FLOOR_M, d, 0.0)

    if smooth and smooth > 0:
        d = gaussian_filter(d, sigma=smooth)

    # A pixel the detector missed inside an otherwise-excavated area is a local
    # minimum in depth, which renders as a thin rock spire standing up off the
    # pit floor. Grey-closing fills those minima, so the floor comes out solid.
    d = grey_closing(d, size=5)

    # Cut the smoothed basin into working benches, then take the hard edges off
    # the risers so they anti-alias without losing the terrace read.
    d, bench_h = _apply_benches(d)
    d = gaussian_filter(d, sigma=0.6)

    # Re-flatten the lid: smoothing feathers a little depth into the flat ground.
    d = np.where(d >= 0.15, d, 0.0)

    return -d, bench_h


# Vertical exaggeration bounds. These pits are hundreds of times wider than
# they are deep, so some stretch is needed for the relief to read at all --
# but the previous code hardcoded the z aspect, which on a 7 km-wide site with
# a 5 m pit worked out to ~1400x and turned every DEM wobble into a sheer
# floating mesa. Capping it keeps the render defensible: mine and DEM figures
# conventionally sit in the single- to low-double-digit range.
# 200x is high, but these are metre-scale pits across kilometre-scale leases:
# below roughly this the excavation flattens into an unreadable pancake. It is
# an order of magnitude tamer than the ~1400x the hardcoded aspect produced,
# and it is printed on the figure so the reader can discount it correctly.
MAX_VERTICAL_EXAGGERATION = 200.0
MIN_VERTICAL_EXAGGERATION = 2.0

# How tall the relief should ideally sit relative to the horizontal frame.
TARGET_Z_ASPECT = 0.20


def _crop_to_excavation(Z, xs, ys, margin_frac=0.35):
    """
    Trim the grid down to the excavated area plus a margin.

    A lease is mostly undisturbed ground: rendering all of it puts a small pit
    in the middle of kilometres of flat lid, which forces a huge vertical
    stretch just to see anything. Cropping to the pit means the same relief
    reads clearly at an honest exaggeration.

    Returns (Z, xs, ys) unchanged if there is nothing to crop to.
    """
    dug = Z < -0.05
    if not dug.any():
        return Z, xs, ys

    rows = np.where(dug.any(axis=1))[0]
    cols = np.where(dug.any(axis=0))[0]
    r0, r1 = int(rows[0]), int(rows[-1])
    c0, c1 = int(cols[0]), int(cols[-1])

    # Pad outwards so the pit sits in context rather than flush to the edge.
    pad_r = max(3, int(round((r1 - r0 + 1) * margin_frac)))
    pad_c = max(3, int(round((c1 - c0 + 1) * margin_frac)))
    r0 = max(0, r0 - pad_r)
    r1 = min(Z.shape[0] - 1, r1 + pad_r)
    c0 = max(0, c0 - pad_c)
    c1 = min(Z.shape[1] - 1, c1 + pad_c)

    # Too small a window renders as a noisy postage stamp; keep the full grid.
    if (r1 - r0) < 8 or (c1 - c0) < 8:
        return Z, xs, ys

    return Z[r0:r1 + 1, c0:c1 + 1], xs[c0:c1 + 1], ys[r0:r1 + 1]


def _render_forensic_model(Z, xs, ys, output_path, volume=0.0, max_depth=0.0,
                            bench_h=0.0):
    """
    Core renderer: builds the exact Plotly 3D Surface forensics model.

    Args:
        Z: 2D numpy array where undisturbed surface is ~0.0 and pits are negative (-depth)
        xs: 1D array of x-coordinates (Distance East in metres)
        ys: 1D array of y-coordinates (Distance North in metres)
        output_path: Target HTML path
        volume: Estimated total volume in m³
        max_depth: Peak depth in metres
        bench_h: bench/terrace height in metres, used to align contour rings
                 to the excavation's working levels
    """
    # Ensure Z values are negative or zero (excavation down into terrain)
    Z = np.where(np.isfinite(Z), Z, 0.0)
    Z = np.clip(Z, None, 0.0)

    dx = abs(float(xs[1] - xs[0])) if len(xs) > 1 else 20.0
    dy = abs(float(ys[1] - ys[0])) if len(ys) > 1 else 20.0

    # Frame the excavation before any scaling decisions are made -- the crop
    # changes the horizontal span the vertical exaggeration is measured against.
    Z, xs, ys = _crop_to_excavation(Z, xs, ys)

    # The title must report the deepest point of the pit, not an average.
    max_depth = float(np.nanmax(np.abs(Z)))
    if not volume or volume <= 0:
        volume = float(np.sum(np.abs(Z)) * (dx * dy))

    # Excavated footprint: how much ground the pit actually breaks, in hectares.
    pit_area_ha = float(np.count_nonzero(Z < -0.05)) * dx * dy / 10000.0

    # Colour range must hug the REAL depth. Previously it was floored at -30 m,
    # so a 6 m pit painted itself entirely within the top 20% of the ramp --
    # every value landed on the pale end and the excavation washed out to white.
    # Anchoring cmin to the actual peak spends the whole gradient on real relief.
    peak_d = max(max_depth, 1.0)
    c_min = -peak_d

    # Axis ticks follow the data too, at a round step for the depth involved.
    if peak_d <= 8:
        step = 1
    elif peak_d <= 20:
        step = 2
    elif peak_d <= 50:
        step = 5
    else:
        step = 10
    z_min = -float(np.ceil(peak_d / float(step)) * step)
    tickvals = list(range(int(z_min), 1, step))

    # Open-cast depth ramp. The undisturbed lid is a muted sage-grey (natural
    # ground) so it separates hard from both the dark canvas and the hot pit
    # colours; the excavation then runs khaki -> gold -> orange -> red -> near
    # black at the floor, so bench depth is readable at a glance.
    # Undisturbed ground is deliberately the QUIETEST colour on the ramp, not
    # the brightest: it covers most of the frame, and painting it white made
    # the intact lid the subject of the figure while the excavation read as a
    # stain on top of it. A muted slate lets the ground recede into the dark
    # canvas so the warm, high-contrast pit becomes the thing you look at.
    colorscale = [
        [0.00, "#2b0f1a"],  # Pit floor -- near-black maroon
        [0.15, "#6d1f2e"],  # Deep red
        [0.32, "#a83a2a"],  # Brick
        [0.48, "#d4682f"],  # Burnt orange
        [0.62, "#e89a4a"],  # Amber
        [0.74, "#d9b382"],  # Tan -- shallow scrape
        [0.85, "#a8a89a"],  # Grey-khaki -- disturbed rim
        [0.94, "#7d8894"],  # Slate
        [1.00, "#68737f"],  # Muted slate -- undisturbed ground
    ]

    print(f"   🎨 Rendering 3D Forensics Model (Vol: {volume:,.0f} m³, Max Depth: {max_depth:.1f}m)...")

    fig = go.Figure(data=[go.Surface(
        x=xs,
        y=ys,
        z=Z,
        surfacecolor=Z,
        cmin=c_min,
        cmax=0,
        colorscale=colorscale,
        colorbar=dict(
            title=dict(
                text="Depth (m)",
                font=dict(color="#cbd5e1", size=11, family="Inter, system-ui, sans-serif")
            ),
            tickvals=tickvals,
            tickfont=dict(color="#e2e8f0", size=11, family="Inter, system-ui, sans-serif"),
            tickmode="array",
            len=0.82,
            thickness=16,
            x=0.93,
            outlinewidth=0,
            bgcolor="rgba(0,0,0,0)"
        ),
        # Contour rings spaced to the bench height, so each line lands on a
        # working terrace instead of cutting arbitrarily across the walls --
        # and projected onto the floor plane as the pit's plan-view footprint.
        contours=dict(
            z=dict(
                show=True,
                usecolormap=True,
                project_z=True,
                highlightcolor="#22d3ee",
                # Explicit levels: with the lid pinned flat at 0, auto-contouring
                # produces almost no rings. Fixed steps draw the pit footprints.
                start=z_min,
                end=-0.5,
                size=bench_h if bench_h and bench_h > 0 else max(1.0, peak_d / 9.0),
                width=1.6
            ),
            x=dict(show=False),
            y=dict(show=False)
        ),
        # Balanced so the benches still shade as distinct steps, but the flat
        # lid -- which faces the light head-on -- does not blow out to white
        # and lose the sage tone that separates ground from excavation.
        lighting=dict(
            ambient=0.68,
            diffuse=0.68,
            specular=0.10,
            roughness=0.72,
            fresnel=0.08
        ),
        lightposition=dict(x=1200, y=1600, z=2400),
        hovertemplate="x: %{x:,.2f}<br>y: %{y:,.2f}<br>z: %{z:.2f}<extra></extra>"
    )])

    # Aspect ratio preserving horizontal layout with dramatic vertical relief
    span_x = float(xs.max() - xs.min()) if len(xs) > 1 else 1000.0
    span_y = float(ys.max() - ys.min()) if len(ys) > 1 else 1000.0
    max_span = max(span_x, span_y) or 1.0

    # Derive the vertical scale from a capped exaggeration rather than fixing
    # the aspect: pick the stretch that would put the relief at TARGET_Z_ASPECT,
    # then clamp it to a defensible range. Whatever survives the clamp is what
    # gets drawn AND what gets printed on the figure, so the two always agree.
    if peak_d > 0:
        vert_exag = TARGET_Z_ASPECT * max_span / peak_d
        vert_exag = float(np.clip(vert_exag, MIN_VERTICAL_EXAGGERATION,
                                  MAX_VERTICAL_EXAGGERATION))
        z_aspect = vert_exag * peak_d / max_span
    else:
        vert_exag, z_aspect = 1.0, 0.1
    bench_count = int(np.ceil(peak_d / bench_h)) if bench_h > 0 else 0

    fig.update_layout(
        title=dict(
            text=(
                "<b>MineGuard 3D Forensics Model</b><br>"
                f"<span style='font-size:12px;color:#f0a03e'>"
                f"Volume: {volume:,.0f} m³ &nbsp;·&nbsp; Max Depth: {max_depth:.1f} m"
                f" &nbsp;·&nbsp; Footprint: {pit_area_ha:,.1f} ha"
                f" &nbsp;·&nbsp; {bench_count} benches @ {bench_h:.1f} m"
                f"</span><br>"
                f"<span style='font-size:10px;color:#7c8ba1'>"
                f"Vertical exaggeration ×{vert_exag:,.0f}</span>"
            ),
            x=0.03,
            xanchor="left",
            y=0.96,
            yanchor="top",
            font=dict(size=19, color="#ffffff", family="Inter, system-ui, sans-serif")
        ),
        paper_bgcolor="#070a10",
        plot_bgcolor="#070a10",
        scene=dict(
            bgcolor="#070a10",
            xaxis=dict(
                title=dict(text="Distance East (m)", font=dict(color="#94a3b8", size=12)),
                gridcolor="#1e293b",
                zerolinecolor="#334155",
                showbackground=True,
                backgroundcolor="rgba(14, 17, 23, 0.85)",
                color="#94a3b8",
                tickfont=dict(color="#94a3b8", size=10)
            ),
            yaxis=dict(
                title=dict(text="Distance North (m)", font=dict(color="#94a3b8", size=12)),
                gridcolor="#1e293b",
                zerolinecolor="#334155",
                showbackground=True,
                backgroundcolor="rgba(14, 17, 23, 0.85)",
                color="#94a3b8",
                tickfont=dict(color="#94a3b8", size=10)
            ),
            zaxis=dict(
                title=dict(text="Elevation (m) – Negative = Below Surface", font=dict(color="#94a3b8", size=12)),
                gridcolor="#1e293b",
                zerolinecolor="#334155",
                showbackground=True,
                backgroundcolor="rgba(14, 17, 23, 0.85)",
                color="#94a3b8",
                tickvals=tickvals,
                tickfont=dict(color="#94a3b8", size=10)
            ),
            camera=dict(
                # A proper aerial-oblique vantage looking down INTO the pit --
                # eye.z raised well above the terrain so the lid reads as
                # ground beneath the camera, not a ceiling overhead, and
                # center is pulled down into the excavation so the basin sits
                # in the middle of the frame instead of the flat rim.
                eye=dict(x=0.92, y=-0.92, z=0.55),
                center=dict(x=0, y=0, z=-0.10),
                up=dict(x=0, y=0, z=1),
                projection=dict(type="perspective")
            ),
            aspectmode="manual",
            # True horizontal proportions: the previous 1.6/1.35 pair stretched
            # east differently from north, so a square pit drew as a rectangle
            # and every plan-view distance was misleading.
            aspectratio=dict(x=span_x / max_span, y=span_y / max_span, z=z_aspect)
        ),
        margin=dict(l=0, r=0, t=76, b=0)
    )

    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    fig.write_html(
        output_path,
        include_plotlyjs="cdn",
        full_html=True,
        config={"displayModeBar": True, "scrollZoom": True, "displaylogo": False}
    )
    print(f"   ✅ 3D Forensics Model saved: {output_path}")


def generate_tin_visualization(combined_image, search_zone, total_area_m2, output_path="output/model_3d.html", volume=None, max_depth=None):
    """
    Generate 3D forensic model from Earth Engine sampled depth + status data.
    """
    print("🏗️  Generating 3D Forensics Model (from GEE sample)...")
    try:
        num_points = min(4000, max(600, int(total_area_m2 / 80)))
        sample_scale = max(10, min(50, int(np.sqrt(total_area_m2 / num_points))))

        sampled = combined_image.sample(
            region=search_zone,
            scale=sample_scale,
            numPixels=num_points,
            geometries=True,
            seed=42
        )

        features = sampled.getInfo()["features"]
        if len(features) < 4:
            print("   ⚠️ Not enough sample points for 3D model")
            _generate_empty_model(output_path)
            return

        lons, lats, depths = [], [], []
        for f in features:
            props = f["properties"]
            coords = f["geometry"]["coordinates"]
            depth = props.get("depth", 0)
            # status: 0 = undisturbed, 1 = illegal, 2 = legal. Undisturbed
            # samples are flattened to the lid so only real pits break the surface.
            status = props.get("status", 1)
            if depth is not None and coords[0] is not None:
                lons.append(float(coords[0]))
                lats.append(float(coords[1]))
                d_val = max(0.0, float(depth))
                depths.append(d_val if (status is None or float(status) > 0) else 0.0)

        if len(lons) < 4:
            _generate_empty_model(output_path)
            return

        lons = np.array(lons)
        lats = np.array(lats)
        depths = np.array(depths)

        # Convert lon/lat to local metres
        lat0, lon0 = float(np.mean(lats)), float(np.mean(lons))
        mx = (lons - lon0) * 111320.0 * np.cos(np.radians(lat0))
        my = (lats - lat0) * 110540.0

        # Shift to non-negative coordinates starting from 0
        mx_min, my_min = float(mx.min()), float(my.min())
        mx -= mx_min
        my -= my_min

        # Interpolate points onto regular grid (150x150) for smoother pit walls
        grid_res = 150
        xs = np.linspace(0, float(mx.max()), grid_res)
        ys = np.linspace(0, float(my.max()), grid_res)
        X, Y = np.meshgrid(xs, ys)

        # Grid data interpolation
        grid_d = interp.griddata((mx, my), depths, (X, Y), method="linear", fill_value=0.0)
        grid_d = np.where(np.isfinite(grid_d), grid_d, 0.0)
        Z, bench_h = _build_pit_surface(grid_d, smooth=2.6)

        _render_forensic_model(Z, xs, ys, output_path, volume=volume,
                               max_depth=max_depth, bench_h=bench_h)

    except Exception as e:
        print(f"   ❌ 3D Model Error: {e}")
        import traceback
        traceback.print_exc()
        _generate_empty_model(output_path)


def generate_tin_from_arrays(mask, depth, boundary, bounds, output_path,
                             max_points=5000, elevation=None, volume=None, max_depth=None):
    """
    Generate 3D forensic model directly from the raster arrays.
    """
    print("🏗️  Generating 3D Forensics Model (from raster arrays)...")
    try:
        west, south, east, north = bounds
        h, w = depth.shape

        # Downsample if too large for webGL rendering performance
        max_dim = 200
        factor = max(1, int(np.ceil(max(h, w) / max_dim)))
        if factor > 1:
            h2, w2 = (h // factor) * factor, (w // factor) * factor
            d_sub = depth[:h2, :w2].reshape(h2 // factor, factor, w2 // factor, factor)
            with np.errstate(invalid="ignore"):
                d = np.nanmean(np.nanmean(d_sub, axis=3), axis=1)
        else:
            d = depth.copy()

        # Downsample the detection mask the same way so it still lines up with
        # the depth grid, then pin everything outside it to the flat lid.
        m = None
        if mask is not None:
            m_arr = np.asarray(mask).astype(np.float64)
            if m_arr.shape == depth.shape:
                if factor > 1:
                    m_sub = m_arr[:h2, :w2].reshape(h2 // factor, factor, w2 // factor, factor)
                    m = m_sub.mean(axis=3).mean(axis=1) > 0.20
                else:
                    m = m_arr > 0.5

        Z, bench_h = _build_pit_surface(d, mask=m, smooth=3.4)

        lat0 = (south + north) / 2.0
        width_m = (east - west) * 111320.0 * np.cos(np.radians(lat0))
        height_m = (north - south) * 110540.0

        xs = np.linspace(0, width_m, Z.shape[1])
        ys = np.linspace(0, height_m, Z.shape[0])

        _render_forensic_model(Z, xs, ys, output_path, volume=volume,
                               max_depth=max_depth, bench_h=bench_h)

    except Exception as e:
        print(f"   ❌ 3D Model Error: {e}")
        import traceback
        traceback.print_exc()
        _generate_empty_model(output_path)

