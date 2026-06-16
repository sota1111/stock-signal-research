import logging
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

_db_logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////workspaces/stock-signal-research/backend/data/app.db")
APP_ENV = os.getenv("APP_ENV", "local")

if APP_ENV == "production" and DATABASE_URL.startswith("sqlite"):
    _db_logger.warning(
        "APP_ENV=production but DATABASE_URL points to SQLite. "
        "Firestore will be used for all reads/writes in production."
    )

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
