from fastapi import APIRouter
from typing import List
from .. import schemas
from ..repositories.research_seed_repository import get_research_seed_repository

router = APIRouter(prefix="/research-seeds", tags=["research-seeds"])


@router.get("/", response_model=List[schemas.ResearchSeedResponse])
def read_research_seeds():
    """過去履歴から抽出した初期リサーチseedデータの一覧。
    調査・仮説検証用データであり、投資助言ではない。"""
    repo = get_research_seed_repository()
    return repo.list_all()
