from fastapi import APIRouter, HTTPException
from typing import List, Optional
from .. import schemas
from ..repositories.paper_repository import get_paper_repository
from ..repositories.trend_repository import get_trend_repository

router = APIRouter(prefix="/papers", tags=["papers"])

# SOT-1213: theme_id 未指定(全カテゴリ・全テーマ)時に全論文(本番Firestoreで1万件超)を
# 取得すると応答に数十秒かかりタイムアウトし、論文一覧が空表示になる。引用数上位 N 件に
# 限定して応答を有界化する。フロントは引用数降順・20件/ページ表示なので体感は不変、
# 上位1000件で98/100テーマをカバーするためカテゴリ絞り込みも維持できる。
ALL_PAPERS_LIMIT = 1000


@router.get("/", response_model=List[schemas.PaperResponse])
def read_papers(theme_id: Optional[str] = None):
    repo = get_paper_repository()
    # テーマ指定時は対象が少数のため全件、未指定時のみ上位 N 件に制限する。
    limit = None if theme_id else ALL_PAPERS_LIMIT
    return repo.list_all(theme_id=theme_id, limit=limit)


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
    # 単一テーマ指定時は月次系列全体を返す(10年=120ヶ月超でも切れないよう十分大きな limit)。
    # 未指定時は既存の top movers(上位10件)。
    limit = 600 if theme_id else 10
    return repo.list_monthly_counts(theme_id=theme_id, limit=limit)
