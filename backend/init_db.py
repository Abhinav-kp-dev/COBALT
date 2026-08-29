from database import engine, Base
import models

print("⏳ Creating Database Tables...")
try:
    Base.metadata.create_all(bind=engine)
    print("✅ Database Tables Created Successfully on Port 5433!")
except Exception as e:
    print(f"❌ Error: {e}")