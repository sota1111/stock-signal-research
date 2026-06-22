from contextlib import asynccontextmanager
import logging
import os
import threading
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from .database import engine, Base
from .routers import themes, papers, patents, companies, supply_chain, investors, dashboard, external_infos, evaluation, research_seeds
from .auth import router as auth_router, get_current_user
from . import seed
from . import models  # noqa: F401  # Register SQLAlchemy models before create_all().


logger = logging.getLogger(__name__)


def _check_auth_config() -> None:
    """Log each missing auth setting distinctly at startup so that
    misconfiguration is visible in Cloud Run logs at boot time."""
    firebase_api_key = os.getenv("FIREBASE_WEB_API_KEY") or os.getenv("FIREBASE_API_KEY")
    auth_secret = os.getenv("AUTH_SECRET")
    allowed_emails = os.getenv("ALLOWED_USER_EMAILS")
    missing = False
    if not firebase_api_key:
        logger.warning("FIREBASE_WEB_API_KEY / FIREBASE_API_KEY not configured")
        missing = True
    if not auth_secret:
        logger.warning("AUTH_SECRET not configured")
        missing = True
    if not allowed_emails:
        logger.warning("ALLOWED_USER_EMAILS not configured")
        missing = True
    if not missing:
        logger.info("auth config OK")


def _run_prod_seed() -> None:
    try:
        seed.seed_research_seeds_firestore()
        # ダッシュボードのコアデータ(themes/companies/papers/supply_chains/月次件数/scores)も
        # 本番Firestoreへ冪等投入する。投入しないとダッシュボードが空になる。
        seed.seed_dashboard_data_firestore()
        # 機関投資家(SEC EDGAR 13F 実データ)も本番Firestoreへ冪等投入する(SOT-965)。
        seed.seed_investors_firestore()
        # 特許(USPTO Patent Public Search 実データ)も本番Firestoreへ冪等投入する(SOT-960)。
        seed.seed_patents_firestore()
    except Exception as e:
        logger.exception("Production Firestore seed failed in background: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _check_auth_config()
    app_env = os.getenv("APP_ENV", "local")
    if app_env in ("local", "test"):
        Base.metadata.create_all(bind=engine)
        seed.run_seed()
    else:
        # production: SQLiteは初期化しない。Firestore接続確認＋初期データ投入(冪等)。
        _check_firestore_connection()
        threading.Thread(target=_run_prod_seed, daemon=True).start()
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
app.include_router(patents.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(companies.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(supply_chain.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(investors.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(dashboard.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(external_infos.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(evaluation.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(research_seeds.router, prefix="/api", dependencies=[Depends(get_current_user)])

# Serve React static files if dist/ exists (Cloud Run production mode)
_dist_dir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist"))
if os.path.isdir(_dist_dir):
    _assets_dir = os.path.join(_dist_dir, "assets")
    if os.path.isdir(_assets_dir):
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")


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


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    """Serve React SPA for all non-API routes."""
    index_path = os.path.join(_dist_dir, "index.html") if os.path.isdir(_dist_dir) else None
    if index_path and os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"error": "Frontend not built", "path": full_path}
