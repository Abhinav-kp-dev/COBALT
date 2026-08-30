"""
MineGuard Phase 2: 3D Forensics Surface Model

Generates an interactive 3D forensic excavation model using Plotly.
Renders excavation pit depth downwards (negative Z), with a calibrated white-to-crimson
gradient, projected 2D floor contours, and dark forensic theme matching the MineGuard UI.
"""

import os
import numpy as np
from scipy.ndimage import uniform_filter, gaussian_filter, binary_dilation
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


def _build_pit_surface(depth, mask=None, smooth=1.0):
    """
    Turn a raw depth raster into the forensic pit surface.

    Outside the detection mask the surface is pinned to exactly 0.0 (the
    reconstructed pre-mining lid); inside it, the depth prism is kept and
    lightly smoothed so pit walls taper rather than staircase.

    Args:
        depth: 2D array of positive depths in metres (0 = undisturbed)
        mask: optional boolean array, True where mining was detected
        smooth: gaussian sigma applied to the retained pit depths

    Returns:
        2D array of Z values, <= 0.0, with undisturbed ground at exactly 0.0
    """
    d = np.asarray(depth, dtype=np.float64)
    d = np.where(np.isfinite(d), d, 0.0)
    d = np.clip(d, 0.0, None)

    if mask is not None:
        m = np.asarray(mask)
        if m.shape == d.shape:
            # Dilate by one pixel so the pit rim is included and the wall has
            # somewhere to climb back up to the lid.
            m = binary_dilation(m.astype(bool), iterations=1)
            d = np.where(m, d, 0.0)

    # Drop sub-noise-floor residual before smoothing so it cannot bleed outward.
    d = np.where(d >= NOISE_FLOOR_M, d, 0.0)

    if smooth and smooth > 0:
        d = gaussian_filter(d, sigma=smooth)

    # Re-flatten the lid: smoothing feathers a little depth into the flat ground.
    d = np.where(d >= 0.25, d, 0.0)

    return -d


def _render_forensic_model(Z, xs, ys, output_path, volume=0.0, max_depth=0.0):
    """
    Core renderer: builds the exact Plotly 3D Surface forensics model.
    
    Args:
        Z: 2D numpy array where undisturbed surface is ~0.0 and pits are negative (-depth)
        xs: 1D array of x-coordinates (Distance East in metres)
        ys: 1D array of y-coordinates (Distance North in metres)
        output_path: Target HTML path
        volume: Estimated total volume in m³
        max_depth: Peak depth in metres
    """
    # Ensure Z values are negative or zero (excavation down into terrain)
    Z = np.where(np.isfinite(Z), Z, 0.0)
    Z = np.clip(Z, None, 0.0)

    # The title must report the deepest point of the pit, not an average.
    max_depth = float(np.nanmax(np.abs(Z)))
    if not volume or volume <= 0:
        dx = float(xs[1] - xs[0]) if len(xs) > 1 else 20.0
        dy = float(ys[1] - ys[0]) if len(ys) > 1 else 20.0
        volume = float(np.sum(np.abs(Z)) * abs(dx * dy))

    # Dynamic z-range for clean colorbar ticks (e.g. 0, -10, -20, -30, ... -60)
    peak_d = max(max_depth, float(np.nanmax(np.abs(Z))), 10.0)
    step = 10 if peak_d <= 80 else 20
    z_min = -float(np.ceil(peak_d / float(step)) * step)
    if z_min > -30:
        z_min = -30.0

    tickvals = list(range(int(z_min), 1, step))

    # White (0.0 / surface) -> Peach -> Coral -> Crimson -> Deep Blood Red (-60.0 / deep pit)
    colorscale = [
        [0.00, "#450a0a"],  # Deepest pit bottom
        [0.15, "#7f1d1d"],  # Dark red
        [0.35, "#b91c1c"],  # Rich red
        [0.55, "#ef4444"],  # Vibrant red
        [0.75, "#f87171"],  # Coral / salmon
        [0.88, "#fca5a5"],  # Light peach
        [0.96, "#fee2e2"],  # Off-white / rim
        [1.00, "#ffffff"],  # Pure white undisturbed surface
    ]

    print(f"   🎨 Rendering 3D Forensics Model (Vol: {volume:,.0f} m³, Max Depth: {max_depth:.1f}m)...")

    fig = go.Figure(data=[go.Surface(
        x=xs,
        y=ys,
        z=Z,
        surfacecolor=Z,
        cmin=z_min,
        cmax=0,
        colorscale=colorscale,
        colorbar=dict(
            tickvals=tickvals,
            tickfont=dict(color="#ffffff", size=11, family="Inter, system-ui, sans-serif"),
            tickmode="array",
            len=0.88,
            thickness=18,
            x=0.93,
            outlinewidth=0,
            bgcolor="rgba(0,0,0,0)"
        ),
        # Projected 2D bottom contours onto the floor bounding plane
        contours=dict(
            z=dict(
                show=True,
                usecolormap=True,
                project_z=True,
                highlightcolor="#facc15",
                # Explicit levels: with the lid pinned flat at 0, auto-contouring
                # produces almost no rings. Fixed steps draw the pit footprints.
                start=z_min,
                end=-1.0,
                size=max(2.0, abs(z_min) / 12.0),
                width=2.5
            ),
            x=dict(show=False),
            y=dict(show=False)
        ),
        lighting=dict(
            ambient=0.75,
            diffuse=0.85,
            specular=0.35,
            roughness=0.5,
            fresnel=0.2
        ),
        lightposition=dict(x=1000, y=1500, z=2000),
        hovertemplate="x: %{x:,.2f}<br>y: %{y:,.2f}<br>z: %{z:.2f}<extra></extra>"
    )])

    # Aspect ratio preserving horizontal layout with dramatic vertical relief
    span_x = float(xs.max() - xs.min()) if len(xs) > 1 else 1000.0
    span_y = float(ys.max() - ys.min()) if len(ys) > 1 else 1000.0
    max_span = max(span_x, span_y) or 1.0

    fig.update_layout(
        title=dict(
            text=(
                "<b>MineGuard 3D Forensics Model</b><br>"
                f"<span style='font-size:12px;color:#cbd5e1'>"
                f"Est. Volume: {volume:,.0f} m³ | Max Depth: {max_depth:.1f}m</span>"
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
                # Pulled in close so the excavation fills the frame instead of
                # floating in the middle of a mostly empty scene.
                eye=dict(x=1.45, y=-1.35, z=0.55),
                center=dict(x=0, y=0, z=-0.08),
                up=dict(x=0, y=0, z=1),
                projection=dict(type="perspective")
            ),
            aspectmode="manual",
            aspectratio=dict(x=span_x / max_span * 1.6, y=span_y / max_span * 1.35, z=0.75)
        ),
        margin=dict(l=0, r=0, t=58, b=0)
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
        Z = _build_pit_surface(grid_d, smooth=1.0)

        _render_forensic_model(Z, xs, ys, output_path, volume=volume, max_depth=max_depth)

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

        Z = _build_pit_surface(d, mask=m, smooth=1.0)

        lat0 = (south + north) / 2.0
        width_m = (east - west) * 111320.0 * np.cos(np.radians(lat0))
        height_m = (north - south) * 110540.0

        xs = np.linspace(0, width_m, Z.shape[1])
        ys = np.linspace(0, height_m, Z.shape[0])

        _render_forensic_model(Z, xs, ys, output_path, volume=volume, max_depth=max_depth)

    except Exception as e:
        print(f"   ❌ 3D Model Error: {e}")
        import traceback
        traceback.print_exc()
        _generate_empty_model(output_path)

