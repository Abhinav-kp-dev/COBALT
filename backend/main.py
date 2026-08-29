import sys
import ee
import os
import uuid
from file_processor import process_lease_file
from phase1_detection import run_unified_detection, initialize_earth_engine

# Same output convention as server.py (static/outputs/{job_id}) so CLI runs
# produce artifacts in a predictable, non-colliding location.
OUTPUT_DIR = "static/outputs"

def main():
    print("\n🛰️  INITIALIZING MINEGUARD SYSTEM v2.0 (Unified) 🛰️")
    print("---------------------------------------------------")

    target_file = input("👉 Enter path to Shapefile (.zip) or GeoJSON: ").strip()
    target_file = target_file.replace('"', '').replace("'", "")

    if not target_file:
        print("❌ Error: No file provided.")
        return

    print("⏳ Reading Lease Boundary...")
    lease_geojson = process_lease_file(target_file)

    if not lease_geojson:
        print("❌ Failed to read boundary. Exiting.")
        return

    print("✅ Boundary loaded successfully!")
    print("🚀 Initializing Unified Detection Pipeline...")

    initialize_earth_engine()

    job_id = str(uuid.uuid4())[:8]
    job_output_dir = os.path.join(OUTPUT_DIR, job_id)
    result = run_unified_detection(lease_geojson, filename=target_file, output_dir=job_output_dir)

    print(f"\n✅ Done. Job ID: {job_id}")
    print(f"   Artifacts written to: {job_output_dir}")
    print(f"   Metrics: {result['metrics']}")

if __name__ == "__main__":
    main()