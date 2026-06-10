from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/supply-chain", tags=["supply-chain"])

@router.get("/", response_model=List[schemas.SupplyChainResponse])
def read_supply_chains(db: Session = Depends(get_db)):
    results = db.query(models.SupplyChain).order_by(models.SupplyChain.order).all()
    
    # Enrich with theme names
    response = []
    for item in results:
        from_theme = db.query(models.Theme).filter(models.Theme.id == item.from_theme_id).first()
        to_theme = db.query(models.Theme).filter(models.Theme.id == item.to_theme_id).first()
        
        res_item = schemas.SupplyChainResponse.model_validate(item)
        res_item.from_theme_name = from_theme.name if from_theme else None
        res_item.to_theme_name = to_theme.name if to_theme else None
        response.append(res_item)
        
    return response

@router.post("/", response_model=schemas.SupplyChainResponse)
def create_supply_chain(sc: schemas.SupplyChainCreate, db: Session = Depends(get_db)):
    db_sc = models.SupplyChain(**sc.model_dump())
    db.add(db_sc)
    db.commit()
    db.refresh(db_sc)
    return db_sc
