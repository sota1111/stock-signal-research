import json
from typing import List, Optional, Set

from fastapi import APIRouter, HTTPException, Query
from .. import schemas
from ..repositories.supply_chain_repository import get_supply_chain_repository
from ..repositories.theme_repository import get_theme_repository
from ..repositories.company_repository import get_company_repository

router = APIRouter(prefix="/supply-chain", tags=["supply-chain"])


def _company_theme_ids(company_id: str) -> Set[str]:
    """company の theme_ids(JSON 文字列 or list)を集合で返す。"""
    company_repo = get_company_repository()
    for c in company_repo.list_all():
        if c.get("id") != company_id:
            continue
        raw = c.get("theme_ids")
        if isinstance(raw, list):
            return set(raw)
        if isinstance(raw, str) and raw.strip():
            try:
                return set(json.loads(raw))
            except (ValueError, TypeError):
                return set()
    return set()


@router.get("/", response_model=List[schemas.SupplyChainResponse])
def read_supply_chains(
    category: Optional[str] = Query(None, description="大カテゴリで絞り込み(from/to いずれか一致)"),
    theme_id: Optional[str] = Query(None, description="テーマIDで絞り込み(from/to いずれか一致)"),
    company_id: Optional[str] = Query(None, description="企業IDで絞り込み(企業が関与するテーマを含む edge)"),
):
    repo = get_supply_chain_repository()
    theme_repo = get_theme_repository()

    results = repo.list_all()
    company_theme_ids = _company_theme_ids(company_id) if company_id else None

    # SOT-1168: テーマ情報は1回だけ一括取得して id->theme マップで解決する。
    # エッジ1件ごとに theme_repo.get_by_id を2回呼ぶ N+1 はデプロイ環境(Firestore)で
    # 供給網拡張時に逐次読み取りタイムアウトを招くため。
    theme_by_id = {t["id"]: t for t in theme_repo.list_all()}

    response = []
    for item in results:
        from_theme = theme_by_id.get(item["from_theme_id"])
        to_theme = theme_by_id.get(item["to_theme_id"])

        from_cat = from_theme.get("category") if from_theme else None
        to_cat = to_theme.get("category") if to_theme else None

        # --- サーバ側フィルタ ---
        if category and category not in (from_cat, to_cat):
            continue
        if theme_id and theme_id not in (item["from_theme_id"], item["to_theme_id"]):
            continue
        if company_theme_ids is not None and not (
            {item["from_theme_id"], item["to_theme_id"]} & company_theme_ids
        ):
            continue

        res_item = schemas.SupplyChainResponse.model_validate(item)
        res_item.from_theme_name = from_theme["name"] if from_theme else None
        res_item.to_theme_name = to_theme["name"] if to_theme else None
        res_item.from_category = from_cat
        res_item.to_category = to_cat
        response.append(res_item)

    return response


@router.post("/", response_model=schemas.SupplyChainResponse)
def create_supply_chain(sc: schemas.SupplyChainCreate):
    repo = get_supply_chain_repository()
    data = sc.model_dump()
    if repo.save(data):
        return data
    raise HTTPException(status_code=500, detail="Failed to create supply chain")
