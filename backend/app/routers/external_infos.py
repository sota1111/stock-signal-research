from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from .. import schemas
from ..repositories.news_repository import get_news_repository

router = APIRouter(prefix="/external-infos", tags=["external-infos"])


@router.get("/", response_model=List[schemas.ExternalInfoResponse])
def list_external_infos(
    theme_id: Optional[str] = Query(None),
    info_type: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
):
    repo = get_news_repository()
    return repo.list_all(theme_id=theme_id, info_type=info_type, limit=limit)


@router.post("/", response_model=schemas.ExternalInfoResponse)
def create_external_info(item: schemas.ExternalInfoCreate):
    repo = get_news_repository()
    data = item.model_dump()
    if repo.save(data):
        return data
    raise HTTPException(status_code=500, detail="Failed to create external info")
