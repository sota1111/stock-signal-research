from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/investors", tags=["investors"])

@router.get("/", response_model=List[schemas.InstitutionalInvestorResponse])
def read_investors(db: Session = Depends(get_db)):
    results = db.query(models.InstitutionalInvestor).all()
    
    response = []
    for item in results:
        company = db.query(models.Company).filter(models.Company.id == item.company_id).first()
        res_item = schemas.InstitutionalInvestorResponse.model_validate(item)
        res_item.company_name = company.name if company else None
        response.append(res_item)
        
    return response

@router.post("/", response_model=schemas.InstitutionalInvestorResponse)
def create_investor(investor: schemas.InstitutionalInvestorCreate, db: Session = Depends(get_db)):
    db_investor = models.InstitutionalInvestor(**investor.model_dump())
    db.add(db_investor)
    db.commit()
    db.refresh(db_investor)
    return db_investor
