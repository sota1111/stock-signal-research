from fastapi import APIRouter, HTTPException
from typing import List
from .. import schemas
from ..repositories.supply_chain_repository import get_supply_chain_repository
from ..repositories.theme_repository import get_theme_repository

router = APIRouter(prefix="/supply-chain", tags=["supply-chain"])

@router.get("/", response_model=List[schemas.SupplyChainResponse])
def read_supply_chains():
    repo = get_supply_chain_repository()
    theme_repo = get_theme_repository()
    
    results = repo.list_all()
    
    # Enrich with theme names
    response = []
    for item in results:
        from_theme = theme_repo.get_by_id(item["from_theme_id"])
        to_theme = theme_repo.get_by_id(item["to_theme_id"])
        
        res_item = schemas.SupplyChainResponse.model_validate(item)
        res_item.from_theme_name = from_theme["name"] if from_theme else None
        res_item.to_theme_name = to_theme["name"] if to_theme else None
        response.append(res_item)
        
    return response

@router.post("/", response_model=schemas.SupplyChainResponse)
def create_supply_chain(sc: schemas.SupplyChainCreate):
    repo = get_supply_chain_repository()
    data = sc.model_dump()
    if repo.save(data):
        return data
    raise HTTPException(status_code=500, detail="Failed to create supply chain")
