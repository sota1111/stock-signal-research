from fastapi import APIRouter, HTTPException
from typing import List
from .. import schemas
from ..repositories.investor_repository import get_investor_repository
from ..repositories.company_repository import get_company_repository

router = APIRouter(prefix="/investors", tags=["investors"])


@router.get("/", response_model=List[schemas.InstitutionalInvestorResponse])
def read_investors():
    repo = get_investor_repository()
    company_repo = get_company_repository()

    results = repo.list_all()

    # 企業名は一括取得した辞書から引く。投資家1件ごとに company_repo.get_by_id を
    # 呼ぶと、デプロイ環境(Firestore)では投資家件数ぶんの逐次ドキュメント読み取り
    # (N+1)になりタイムアウト→読み込み失敗の原因になる。companies を1回だけ
    # 取得して id→name のマップで解決する。SOT-1168
    company_names = {
        company["id"]: company.get("name")
        for company in company_repo.list_all()
        if company.get("id")
    }

    response = []
    for item in results:
        res_item = schemas.InstitutionalInvestorResponse.model_validate(item)
        res_item.company_name = company_names.get(item["company_id"])
        response.append(res_item)

    return response


@router.post("/", response_model=schemas.InstitutionalInvestorResponse)
def create_investor(investor: schemas.InstitutionalInvestorCreate):
    repo = get_investor_repository()
    data = investor.model_dump()
    if repo.save(data):
        return data
    raise HTTPException(status_code=500, detail="Failed to create investor")
