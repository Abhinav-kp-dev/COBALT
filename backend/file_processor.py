import geopandas as gpd
import os
import zipfile
import shutil
import shapely.geometry
import shapely.ops
import numbers

def _is_coord_list(obj):
    """Checks if an object is a list of coordinates [x, y, z?]"""
    return isinstance(obj, (list, tuple)) and len(obj) >= 2 and all(isinstance(x, numbers.Number) for x in obj)

def _sanitize_coords(obj):
    """
    Recursively removes Z-coordinates (3D) to ensure GEE compatibility (2D only).
    Converts numpy floats to python floats.
    """
    if isinstance(obj, dict):
        return {k: _sanitize_coords(v) for k, v in obj.items()}
    if _is_coord_list(obj):
        # Keep only lon, lat (first two entries)
        return [float(obj[0]), float(obj[1])]
    if isinstance(obj, (list, tuple)):
        return [_sanitize_coords(v) for v in obj]
    if isinstance(obj, numbers.Number):
        if float(obj).is_integer():
            return int(obj)
        return float(obj)
    return obj

def _extract_single_polygon(geom):
    """Ensures the output is always a single clean Polygon or MultiPolygon."""
    if geom.geom_type in ("Polygon", "MultiPolygon"):
        return geom
    
    # If it's a collection, try to merge valid polygons
    if geom.geom_type == "GeometryCollection":
        parts = [g for g in geom.geoms if g.geom_type in ("Polygon", "MultiPolygon")]
        if parts:
            return shapely.ops.unary_union(parts)
            
    # Try buffering (fix self-intersections)
    try:
        cleaned = geom.buffer(0)
        if cleaned.geom_type in ("Polygon", "MultiPolygon"):
            return cleaned
    except Exception:
        pass

    # Fallback: Bounding Box
    return shapely.geometry.Polygon(geom.envelope.exterior.coords)

def process_lease_file(file_path):
    """
    Main entry point: Reads .zip/.kml/.geojson, reprojects to EPSG:4326,
    and returns a clean GeoJSON dictionary.
    """
    print(f"📂 Processing input file: {os.path.basename(file_path)}")
    extract_path = "temp_shapefile_extract"
    gdf = None

    try:
        # A. Handle ZIP (Shapefiles)
        if file_path.lower().endswith('.zip'):
            if os.path.exists(extract_path):
                shutil.rmtree(extract_path)
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                zip_ref.extractall(extract_path)
            
            shp_file = None
            for root, dirs, files in os.walk(extract_path):
                for file in files:
                    if file.endswith(".shp"):
                        shp_file = os.path.join(root, file)
                        break
                if shp_file: break
            
            if not shp_file:
                raise ValueError("❌ No .shp file found in the zip archive.")
            gdf = gpd.read_file(shp_file)

        # B. Handle Single Files
        elif file_path.lower().endswith(('.kml', '.geojson', '.json')):
            # Note: KML requires 'fiona' library installed
            gdf = gpd.read_file(file_path)
        else:
            raise ValueError("❌ Unsupported format. Please upload .zip, .kml, or .geojson")

        # C. Validation & Reprojection
        if gdf is None or gdf.empty:
            raise ValueError("❌ Input file contained no geometries!")

        # Standardize Coordinate Reference System to WGS84 (Lat/Lon)
        if gdf.crs is not None and gdf.crs.to_string() != "EPSG:4326":
            print(f"🔄 Reprojecting from {gdf.crs} to EPSG:4326...")
            gdf = gdf.to_crs(epsg=4326)

        # D. Geometry Cleanup
        combined_geom = gdf.unary_union
        combined_geom = _extract_single_polygon(combined_geom)

        # E. Output Generation
        mapping = shapely.geometry.mapping(combined_geom)
        safe_geojson = _sanitize_coords(mapping)

        if 'type' not in safe_geojson or 'coordinates' not in safe_geojson:
            raise ValueError("❌ Processed geometry is invalid.")

        return safe_geojson

    except Exception as e:
        print(f"⚠️ File Processing Error: {e}")
        return None
    finally:
        # Cleanup temp directory
        if os.path.exists(extract_path):
            shutil.rmtree(extract_path)