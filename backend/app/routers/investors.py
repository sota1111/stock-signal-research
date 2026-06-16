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
    
    response = []
    for item in results:
        company = company_repo.get_by_id(item["company_id"])
        res_item = schemas.InstitutionalInvestorResponse.model_validate(item)
        res_item.company_name = company["name"] if company else None
        response.append(res_item)
        
    return response

@router.post("/", response_model=schemas.InstitutionalInvestorResponse)
def create_investor(investor: schemas.InstitutionalInvestorCreate):
    repo = get_investor_repository()
    data = investor.model_dump()
    if repo.save(data):
        return data
    raise HTTPException(status_code=500, detail="Failed to create investor")
