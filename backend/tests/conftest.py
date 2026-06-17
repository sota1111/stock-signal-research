import os
import pytest
import tempfile
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Set environment variables before any app imports
os.environ["APP_ENV"] = "test"
# Create a temporary file for the SQLite database
db_fd, db_path = tempfile.mkstemp()
os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"

# Now import the app and other components
from app.main import app
from app.database import Base, engine, SessionLocal, get_db
from app.auth import get_current_user
from app import seed

# Monkeypatch seed.run_seed to do nothing during tests to have a clean state
seed.run_seed = lambda: None

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    # Create all tables
    Base.metadata.create_all(bind=engine)
    # We can run seed here if we want initial data, or leave it to tests
    # But main.py already runs it in lifespan if APP_ENV is test.
    # To have a clean state for each test, we might want to truncate or recreate.
    yield
    Base.metadata.drop_all(bind=engine)
    os.close(db_fd)
    if os.path.exists(db_path):
        os.unlink(db_path)

@pytest.fixture
def db():
    connection = engine.connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    def override_get_current_user():
        return "test_user"

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    with TestClient(app) as c:
        yield c
    
    app.dependency_overrides.clear()
