from fastapi import APIRouter, HTTPException
from typing import List, Optional
from collections import Counter
from .. import schemas
from ..repositories.patent_repository import get_patent_repository

router = APIRouter(prefix="/patents", tags=["patents"])


@router.get("/", response_model=List[schemas.PatentResponse])
def read_patents(theme_id: Optional[str] = None):
    repo = get_patent_repository()
    return repo.list_all(theme_id=theme_id)


@router.post("/", response_model=schemas.PatentResponse)
def create_patent(patent: schemas.PatentCreate):
    repo = get_patent_repository()
    data = patent.model_dump()
    if repo.save(data):
        return data
    raise HTTPException(status_code=500, detail="Failed to create patent")


@router.get("/yearly", response_model=List[schemas.PatentYearlyCountResponse])
def read_patent_yearly_counts(theme_id: Optional[str] = None):
    repo = get_patent_repository()
    return repo.list_yearly_counts(theme_id=theme_id)


@router.get("/top-assignees")
def read_top_assignees(theme_id: Optional[str] = None, limit: int = 10):
    """収集済み特許から上位の出願人(assignee)を集計して返す。"""
    repo = get_patent_repository()
    counter: Counter = Counter()
    for p in repo.list_all(theme_id=theme_id):
        name = (p.get("assignee") or "").strip()
        if name:
            counter[name] += 1
    return [{"assignee": name, "count": n} for name, n in counter.most_common(limit)]
