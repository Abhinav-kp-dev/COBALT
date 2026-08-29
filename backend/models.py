from sqlalchemy import Column, Integer, String, Float, DateTime
from geoalchemy2 import Geometry
from database import Base
import datetime

class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(String, unique=True, index=True)
    filename = Column(String)
    
    # Metrics
    illegal_area_m2 = Column(Float)
    volume_m3 = Column(Float)
    avg_depth_m = Column(Float)
    truckloads = Column(Integer)
    
    # Status
    status = Column(String) 
    
    # Artifact Links
    report_url = Column(String)
    map_url = Column(String)
    model_url = Column(String)
    
    # Spatial Data (Stores the Polygons)
    geometry = Column(Geometry('MULTIPOLYGON', srid=4326), nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)