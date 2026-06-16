from fastapi import APIRouter, HTTPException
from typing import List
from .. import schemas
from ..repositories.theme_repository import get_theme_repository
from ..repositories.score_repository import get_score_repository
from ..repositories.news_repository import get_news_repository

router = APIRouter(prefix="/themes", tags=["themes"])

@router.get("/", response_model=List[schemas.ThemeResponse])
def read_themes():
    repo = get_theme_repository()
    return repo.list_all()

@router.post("/", response_model=schemas.ThemeResponse)
def create_theme(theme: schemas.ThemeCreate):
    repo = get_theme_repository()
    theme_data = theme.model_dump()
    if repo.save(theme_data):
        # We need the saved object back. Since save might generate ID.
        # But our save returns bool. In practice, for POST, we might want to return the saved data.
        # SQLite repo updates the dict with ID if missing.
        return theme_data
    raise HTTPException(status_code=500, detail="Failed to create theme")

@router.get("/{theme_id}", response_model=schemas.ThemeResponse)
def read_theme(theme_id: str):
    repo = get_theme_repository()
    db_theme = repo.get_by_id(theme_id)
    if db_theme is None:
        raise HTTPException(status_code=404, detail="Theme not found")
    return db_theme

@router.put("/{theme_id}", response_model=schemas.ThemeResponse)
def update_theme(theme_id: str, theme: schemas.ThemeUpdate):
    repo = get_theme_repository()
    db_theme = repo.get_by_id(theme_id)
    if db_theme is None:
        raise HTTPException(status_code=404, detail="Theme not found")
    
    update_data = theme.model_dump(exclude_unset=True)
    full_data = {**db_theme, **update_data}
    if repo.save(full_data):
        return full_data
    raise HTTPException(status_code=500, detail="Failed to update theme")

@router.delete("/{theme_id}")
def delete_theme(theme_id: str):
    repo = get_theme_repository()
    if repo.delete(theme_id):
        return {"message": "Theme deleted"}
    raise HTTPException(status_code=404, detail="Theme not found")

@router.get("/{theme_id}/external-infos", response_model=schemas.ThemeExternalInfosResponse)
def get_theme_external_infos(theme_id: str):
    repo = get_theme_repository()
    return {
        "news": repo.list_external_infos_by_theme(theme_id, "news"),
        "announcements": repo.list_external_infos_by_theme(theme_id, "announcement"),
        "earnings": repo.list_external_infos_by_theme(theme_id, "earnings"),
    }

@router.get("/{theme_id}/alignment", response_model=schemas.AlignmentScoreResponse)
def get_theme_alignment(theme_id: str):
    score_repo = get_score_repository()
    news_repo = get_news_repository()
    
    alignment = score_repo.get_by_theme(theme_id)
    if alignment is None:
        return schemas.AlignmentScoreResponse(
            id="",
            theme_id=theme_id,
            score=0.0,
            news_score=0.0,
            announcement_score=0.0,
            earnings_score=0.0,
            confidence=0.0,
            evidence_count=0,
            top_evidence=[],
        )
    
    # top_evidence: ExternalInfo from news_repository
    top_evidence = news_repo.list_all(theme_id=theme_id, limit=5)
    # Sort by relevance_score desc manually if list_all doesn't support it yet
    top_evidence.sort(key=lambda x: x.get("relevance_score", 0.0), reverse=True)
    
    result = schemas.AlignmentScoreResponse.model_validate(alignment)
    result.top_evidence = top_evidence
    return result
