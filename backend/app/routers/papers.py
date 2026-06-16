from fastapi import APIRouter, HTTPException
from typing import List, Optional
from .. import schemas
from ..repositories.paper_repository import get_paper_repository
from ..repositories.trend_repository import get_trend_repository

router = APIRouter(prefix="/papers", tags=["papers"])


@router.get("/", response_model=List[schemas.PaperResponse])
def read_papers(theme_id: Optional[str] = None):
    repo = get_paper_repository()
    return repo.list_all(theme_id=theme_id)


@router.post("/", response_model=schemas.PaperResponse)
def create_paper(paper: schemas.PaperCreate):
    repo = get_paper_repository()
    paper_data = paper.model_dump()
    if repo.save(paper_data):
        return paper_data
    raise HTTPException(status_code=500, detail="Failed to create paper")


@router.get("/monthly", response_model=List[schemas.PaperMonthlyCountResponse])
def read_paper_monthly_counts(theme_id: Optional[str] = None):
    repo = get_trend_repository()
    return repo.list_monthly_counts(theme_id=theme_id)
