# Use a lightweight Python image
FROM python:3.10-slim

# 1. Install System Dependencies (Required for GDAL/GeoPandas)
RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 2. Install Python Dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy Application Code
COPY . .

# 4. Expose the Port
EXPOSE 8000

# 5. Initialize DB and Start Server
# Use unbuffered Python output (-u flag) so logs appear immediately
# Sleep for 10 seconds to let the DB start, then run init and server
CMD sh -c "sleep 10 && python -u init_db.py && python -u -m uvicorn server:app --host 0.0.0.0 --port 8000"