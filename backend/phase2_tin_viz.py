"""
MineGuard Phase 2: 3D TIN (Triangulated Irregular Network) Visualization

Generates an interactive 3D surface model of mining pits using Plotly.
Samples depth + status data from Earth Engine, triangulates with Scipy,
and renders a color-coded 3D mesh (Red=Illegal, Green=Legal, Gray=Undisturbed).
"""

import ee
import numpy as np
from scipy.spatial import Delaunay
import plotly.graph_objects as go
import os


def generate_tin_visualization(combined_image, search_zone, total_area_m2, output_path="output/model_3d.html"):
    """
    Generate a 3D TIN visualization from Earth Engine depth + status data.
    
    Args:
        combined_image: ee.Image with 'depth' and 'status' bands
                        status: 0=undisturbed, 1=illegal, 2=legal
        search_zone: ee.Geometry defining the area to sample
        total_area_m2: Total mining area in square meters (used to auto-scale sampling)
        output_path: File path for the output HTML file
    """
    print("🏗️  Generating 3D TIN Model...")
    
    try:
        # --- 1. DETERMINE SAMPLE DENSITY ---
        # More points for larger areas, cap at 5000 to avoid timeouts
        num_points = min(5000, max(500, int(total_area_m2 / 100)))
        
        # Adaptive scale: larger areas need coarser sampling to stay within limits
        sample_scale = max(10, min(60, int(np.sqrt(total_area_m2 / num_points))))
        
        print(f"   📍 Sampling ~{num_points} points at {sample_scale}m resolution...")
        
        # --- 2. SAMPLE POINTS FROM EARTH ENGINE ---
        sampled = combined_image.sample(
            region=search_zone,
            scale=sample_scale,
            numPixels=num_points,
            geometries=True,
            seed=42
        )
        
        # Fetch sampled data
        features = sampled.getInfo()["features"]
        
        if len(features) < 4:
            print("   ⚠️  Not enough sample points for 3D model (need at least 4)")
            _generate_empty_model(output_path)
            return
        
        print(f"   ✅ Retrieved {len(features)} sample points")
        
        # --- 3. EXTRACT COORDINATES ---
        lons = []
        lats = []
        depths = []
        statuses = []
        
        for f in features:
            props = f["properties"]
            coords = f["geometry"]["coordinates"]
            
            depth = props.get("depth", 0)
            status = props.get("status", 0)
            
            # Filter out invalid points
            if depth is not None and coords[0] is not None:
                lons.append(float(coords[0]))
                lats.append(float(coords[1]))
                depths.append(float(depth))
                statuses.append(int(status))
        
        if len(lons) < 4:
            print("   ⚠️  Not enough valid points after filtering")
            _generate_empty_model(output_path)
            return
        
        lons = np.array(lons)
        lats = np.array(lats)
        depths = np.array(depths)
        statuses = np.array(statuses)
        
        _render_tin(lons, lats, depths, statuses, output_path)

    except Exception as e:
        print(f"   ❌ 3D Model Error: {e}")
        import traceback
        traceback.print_exc()
        _generate_empty_model(output_path)


def _generate_empty_model(output_path):
    """Generate a placeholder HTML when 3D model cannot be created."""
    html = """
    <!DOCTYPE html>
    <html>
    <head><title>MineGuard 3D Model</title></head>
    <body style="background:#0a0a1a; color:white; display:flex; align-items:center; 
                 justify-content:center; height:100vh; margin:0; font-family:sans-serif;">
        <div style="text-align:center;">
            <h2>🛸 3D Model Unavailable</h2>
            <p>Insufficient data points to generate a 3D terrain model for this region.</p>
            <p style="color:#888;">Try a larger area or adjust detection thresholds.</p>
        </div>
    </body>
    </html>
    """
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
    with open(output_path, "w") as f:
        f.write(html)
    print(f"   ⚠️  Placeholder model saved: {output_path}")

def _render_tin(lons, lats, depths, statuses, output_path):
    """
    Build and save the Plotly TIN. Shared by both entry points so the Earth
    Engine path and the classifier's raster path produce identical output.
    """
    lons = np.asarray(lons, dtype=float)
    lats = np.asarray(lats, dtype=float)
    depths = np.asarray(depths, dtype=float)
    statuses = np.asarray(statuses, dtype=int)

    # --- PROJECT TO LOCAL METRES ---
    # Degrees on x/y against metres on z distorts every pit: one degree of
    # longitude is ~100,000x a metre, so the mesh collapses to a sheet and the
    # aspect ratio has to be faked. Working in metres from the site centroid
    # makes slope angles and pit proportions physically true.
    lat0, lon0 = float(np.mean(lats)), float(np.mean(lons))
    mx = (lons - lon0) * 111320.0 * np.cos(np.radians(lat0))
    my = (lats - lat0) * 110540.0

    print("   🔺 Building Delaunay triangulation...")
    tri = Delaunay(np.column_stack((mx, my)))

    # Pits read as excavation below the reconstructed pre-mining surface.
    z = -depths
    illegal = int((statuses == 1).sum())
    legal = int((statuses == 2).sum())

    print("   🎨 Rendering 3D mesh...")
    fig = go.Figure()

    fig.add_trace(go.Mesh3d(
        x=mx, y=my, z=z,
        i=tri.simplices[:, 0], j=tri.simplices[:, 1], k=tri.simplices[:, 2],
        intensity=depths,
        # Sequential ramp from intact ground to deep excavation. Sampled from
        # spoil and exposed-overburden tones rather than a rainbow, so depth
        # reads as one continuous quantity instead of banded categories.
        colorscale=[
            [0.00, "#e8e2d5"],
            [0.25, "#c9a26b"],
            [0.50, "#a1673a"],
            [0.75, "#6d3b28"],
            [1.00, "#3b1f1c"],
        ],
        colorbar=dict(
            title=dict(text="Excavation<br>depth (m)",
                       font=dict(color="#c9d1d9", size=11)),
            tickfont=dict(color="#8b949e", size=10),
            outlinewidth=0, thickness=14, len=0.55, x=0.9,
        ),
        flatshading=False,
        lighting=dict(ambient=0.55, diffuse=0.85, specular=0.12,
                      roughness=0.85, fresnel=0.15),
        lightposition=dict(x=1000, y=1500, z=3000),
        hovertemplate=("Depth <b>%{customdata:.1f} m</b><br>"
                       "%{x:.0f} m E, %{y:.0f} m N<extra></extra>"),
        customdata=depths,
        name="Terrain",
        showlegend=False,
    ))

    # Datum plane: the reconstructed pre-mining surface every depth is measured
    # against. Rendered as a faint sheet so the pit volume is legible at a glance.
    pad = 0.02 * max(np.ptp(mx), np.ptp(my))
    gx, gy = np.meshgrid(
        np.linspace(mx.min() - pad, mx.max() + pad, 2),
        np.linspace(my.min() - pad, my.max() + pad, 2),
    )
    fig.add_trace(go.Surface(
        x=gx, y=gy, z=np.zeros_like(gx),
        opacity=0.10, showscale=False, hoverinfo="skip",
        colorscale=[[0, "#58a6ff"], [1, "#58a6ff"]],
        name="Pre-mining surface", showlegend=False,
    ))

    axis = dict(
        backgroundcolor="#0d1117", gridcolor="#21262d", zerolinecolor="#30363d",
        showbackground=True, color="#8b949e",
        tickfont=dict(size=9),
    )
    _ttl = lambda t: dict(text=t, font=dict(size=11, color="#8b949e"))

    span = max(np.ptp(mx), np.ptp(my)) or 1.0
    fig.update_layout(
        title=dict(
            text=("<b>Volumetric Excavation Model</b><br>"
                  f"<span style='font-size:12px;color:#8b949e'>"
                  f"{illegal + legal:,} detected vertices &nbsp;·&nbsp; "
                  f"peak depth {depths.max():.1f} m &nbsp;·&nbsp; "
                  f"{len(tri.simplices):,} facets</span>"),
            font=dict(size=19, color="#f0f6fc",
                      family="Helvetica Neue, Helvetica, Arial, sans-serif"),
            x=0.5, xanchor="center", y=0.95,
        ),
        paper_bgcolor="#0d1117",
        font=dict(color="#c9d1d9",
                  family="Helvetica Neue, Helvetica, Arial, sans-serif"),
        scene=dict(
            xaxis=dict(title=_ttl("Easting (m)"), **axis),
            yaxis=dict(title=_ttl("Northing (m)"), **axis),
            zaxis=dict(title=_ttl("Elevation (m a.s.l.)"), **axis),
            camera=dict(eye=dict(x=1.4, y=-1.5, z=0.85),
                        up=dict(x=0, y=0, z=1)),
            aspectmode="manual",
            # True horizontal proportions; vertical exaggerated so meaningful
            # pits stay visible across sites of very different extent.
            aspectratio=dict(x=np.ptp(mx) / span, y=np.ptp(my) / span, z=0.45),
        ),
        margin=dict(l=0, r=0, t=78, b=0),
    )

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    fig.write_html(output_path, include_plotlyjs="cdn", full_html=True,
                   config={"displayModeBar": True, "scrollZoom": True,
                           "displaylogo": False})

    print(f"   ✅ 3D Model saved: {output_path}")
    print(f"      📊 {len(mx):,} vertices, {len(tri.simplices):,} triangles "
          f"({illegal:,} illegal / {legal:,} legal)")


def _block_reduce(a, f):
    """Mean-pool by an integer factor, ignoring no-data. Downsampling this way
    averages neighbours instead of picking one, which removes single-pixel
    DEM speckle without inventing terrain."""
    h, w = a.shape
    h2, w2 = (h // f) * f, (w // f) * f
    a = a[:h2, :w2].reshape(h2 // f, f, w2 // f, f)
    with np.errstate(invalid="ignore"):
        return np.nanmean(np.nanmean(a, axis=3), axis=1)


def _render_surface(depth, bounds, output_path, elevation=None, max_cells=260):
    """
    Render the excavation as a continuous gridded surface.

    The classifier path holds a full raster, so the terrain can be drawn on its
    native grid. Scattering random points and triangulating them - which is what
    the Earth Engine path must do - produces long thin triangles that spike
    between neighbours, so a smoothly curving pit wall reads as jagged peaks.
    """
    from scipy.ndimage import uniform_filter

    west, south, east, north = bounds
    d = np.where(np.isfinite(depth), depth, np.nan)

    # Draw the real ground surface. `depth` is a residual (smoothed DEM minus
    # DEM) that swings either side of zero across ordinary topography, so
    # plotting it directly renders flat ground as rolling hills. Elevation is
    # the actual terrain; depth becomes the colour laid over it.
    ground = np.where(np.isfinite(elevation), elevation, np.nan) \
        if elevation is not None else -d

    f = max(1, int(np.ceil(max(ground.shape) / max_cells)))
    if f > 1:
        ground = _block_reduce(ground, f)
        d = _block_reduce(d, f)
    z = ground

    # Gentle 3x3 mean over the grid: the depth band is a difference of two DEM
    # surfaces, so it carries per-pixel noise that would otherwise read as
    # spurious relief. Cosmetic only - the metrics use the unsmoothed array.
    # Fill no-data with the scene median, never zero: on a plateau sitting at
    # 220 m a.s.l. a zero-filled cell becomes a 220 m cliff to sea level, which
    # is exactly the false relief that makes flat ground look mountainous.
    fill = float(np.nanmedian(z)) if np.isfinite(z).any() else 0.0
    filled = np.where(np.isfinite(z), z, fill)
    z = uniform_filter(filled, size=3, mode="nearest")

    h, w = z.shape
    lat0 = (south + north) / 2.0
    xs = np.linspace(0, (east - west) * 111320.0 * np.cos(np.radians(lat0)), w)
    ys = np.linspace((north - south) * 110540.0, 0, h)

    # Clamp to robust percentiles before display. The depth band is a
    # difference of two DEM surfaces, so a handful of edge artefacts reach
    # tens of metres; left alone they stretch the colour scale flat and spike
    # the mesh, hiding the actual pit. Display only - metrics are unclamped.
    lo, hi = np.nanpercentile(z, [1, 99])
    hi = max(hi, lo + 1.0)
    z = np.clip(z, lo, hi)

    surface = z             # metres above sea level
    depth_m = np.clip(np.where(np.isfinite(d), d, 0.0), 0, None)

    print("   🎨 Rendering gridded surface...")
    fig = go.Figure(go.Surface(
        x=xs, y=ys, z=surface,
        surfacecolor=depth_m,
        cmin=float(np.nanpercentile(depth_m, 2)),
        cmax=float(np.nanpercentile(depth_m, 98)),
        colorscale=[
            [0.00, "#e8e2d5"], [0.25, "#c9a26b"], [0.50, "#a1673a"],
            [0.75, "#6d3b28"], [1.00, "#3b1f1c"],
        ],
        colorbar=dict(
            title=dict(text="Excavation<br>depth (m)",
                       font=dict(color="#c9d1d9", size=11)),
            tickfont=dict(color="#8b949e", size=10),
            outlinewidth=0, thickness=14, len=0.55, x=0.9,
        ),
        lighting=dict(ambient=0.6, diffuse=0.9, specular=0.1, roughness=0.9),
        lightposition=dict(x=1000, y=1500, z=3000),
        contours=dict(z=dict(show=True, usecolormap=True,
                             project_z=False, width=1)),
        hovertemplate=("Depth <b>%{surfacecolor:.1f} m</b><br>"
                       "%{x:.0f} m E, %{y:.0f} m N<extra></extra>"),
        name="Terrain",
    ))

    axis = dict(backgroundcolor="#0d1117", gridcolor="#21262d",
                zerolinecolor="#30363d", showbackground=True,
                color="#8b949e", tickfont=dict(size=9))
    _ttl = lambda t: dict(text=t, font=dict(size=11, color="#8b949e"))
    span = max(xs.max(), ys.max()) or 1.0

    fig.update_layout(
        title=dict(
            text=("<b>Volumetric Excavation Model</b><br>"
                  f"<span style='font-size:12px;color:#8b949e'>"
                  f"{w}x{h} grid at {f * 20} m &nbsp;·&nbsp; "
                  f"elevation {np.nanmin(surface):.0f}-{np.nanmax(surface):.0f} m &nbsp;·&nbsp; "
                  f"max excavation {np.nanmax(depth_m):.1f} m</span>"),
            font=dict(size=19, color="#f0f6fc",
                      family="Helvetica Neue, Helvetica, Arial, sans-serif"),
            x=0.5, xanchor="center", y=0.95,
        ),
        paper_bgcolor="#0d1117",
        font=dict(color="#c9d1d9",
                  family="Helvetica Neue, Helvetica, Arial, sans-serif"),
        scene=dict(
            xaxis=dict(title=_ttl("Easting (m)"), **axis),
            yaxis=dict(title=_ttl("Northing (m)"), **axis),
            zaxis=dict(title=_ttl("Elevation (m a.s.l.)"), **axis),
            camera=dict(eye=dict(x=1.4, y=-1.5, z=0.85), up=dict(x=0, y=0, z=1)),
            aspectmode="manual",
            aspectratio=dict(x=xs.max() / span, y=ys.max() / span, z=0.35),
        ),
        margin=dict(l=0, r=0, t=78, b=0),
    )

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    fig.write_html(output_path, include_plotlyjs="cdn", full_html=True,
                   config={"displayModeBar": True, "scrollZoom": True,
                           "displaylogo": False})
    print(f"   ✅ 3D Model saved: {output_path}")
    print(f"      📊 {w}x{h} grid, elevation "
          f"{np.nanmin(surface):.0f}..{np.nanmax(surface):.0f} m a.s.l., "
          f"max excavation {np.nanmax(depth_m):.1f} m")


def generate_tin_from_arrays(mask, depth, boundary, bounds, output_path,
                             max_points=5000, elevation=None):
    """
    Build the 3D model from the classifier's raster instead of re-sampling
    Earth Engine. The arrays are already in memory, so this drops a network
    round-trip and guarantees the model shows the same detections the metrics
    were computed from.

    status: 0 = undisturbed, 1 = illegal, 2 = legal -- matching the EE path.
    """
    print("🏗️  Generating 3D TIN Model (from classifier raster)...")
    try:
        west, south, east, north = bounds
        h, w = depth.shape

        status = np.zeros((h, w), dtype=int)
        status[mask & ~boundary] = 1
        status[mask & boundary] = 2

        # Model the detected pits plus enough surrounding terrain to give them
        # context; an all-detection mesh has no rim to read the pit against.
        interesting = mask | (np.isfinite(depth) & (depth > 0.5))
        rows, cols = np.nonzero(interesting)
        if len(rows) < 4:
            print("   ⚠️  Not enough detected terrain for a 3D model")
            _generate_empty_model(output_path)
            return

        if len(rows) > max_points:
            pick = np.random.default_rng(42).choice(len(rows), max_points,
                                                    replace=False)
            rows, cols = rows[pick], cols[pick]

        lons = west + (cols + 0.5) * (east - west) / w
        lats = north - (rows + 0.5) * (north - south) / h
        d = np.where(np.isfinite(depth[rows, cols]), depth[rows, cols], 0.0)

        _render_surface(depth, bounds, output_path, elevation=elevation)

    except Exception as e:
        print(f"   ❌ 3D Model Error: {e}")
        import traceback
        traceback.print_exc()
        _generate_empty_model(output_path)
