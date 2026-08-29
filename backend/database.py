import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# SMART CONNECTION:
# Check if running in Docker (Env Variable), else use Localhost
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:mining_secret@localhost:5433/mineguard"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()