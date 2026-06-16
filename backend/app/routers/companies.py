from fastapi import APIRouter, HTTPException
from typing import List
from .. import schemas
from ..repositories.company_repository import get_company_repository

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/", response_model=List[schemas.CompanyResponse])
def read_companies():
    repo = get_company_repository()
    return repo.list_all()


@router.post("/", response_model=schemas.CompanyResponse)
def create_company(company: schemas.CompanyCreate):
    repo = get_company_repository()
    company_data = company.model_dump()
    if repo.save(company_data):
        return company_data
    raise HTTPException(status_code=500, detail="Failed to create company")


@router.get("/{company_id}", response_model=schemas.CompanyResponse)
def read_company(company_id: str):
    repo = get_company_repository()
    db_company = repo.get_by_id(company_id)
    if db_company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return db_company
