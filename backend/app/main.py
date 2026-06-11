from contextlib import asynccontextmanager
import os
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import themes, papers, companies, supply_chain, investors, dashboard, external_infos
from .auth import router as auth_router, get_current_user
from . import seed
from . import models

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    seed.run_seed()

    app_env = os.getenv("APP_ENV", "local")
    if app_env != "local":
        _check_firestore_connection()

    yield

app = FastAPI(title="Stock Signal Research API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(themes.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(papers.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(companies.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(supply_chain.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(investors.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(dashboard.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(external_infos.router, prefix="/api", dependencies=[Depends(get_current_user)])

@app.get("/health")
def health():
    return {"status": "ok"}

def _check_firestore_connection():
    import logging
    _logger = logging.getLogger(__name__)
    try:
        from google.cloud import firestore
        project_id = os.getenv("GCP_PROJECT_ID")
        if not project_id:
            _logger.error("GCP_PROJECT_ID is not set. Firestore connection skipped.")
            return
        db = firestore.Client(project=project_id)
        db.collection("_health").document("check").get()
        _logger.info("Firestore connection: OK")
    except Exception as e:
        _logger.error(f"Firestore connection failed: {e}")
