from fastapi import APIRouter, Depends
from .. import schemas
from ..repositories.company_repository import get_company_repository
from ..repositories.stock_price_repository import get_stock_price_repository
from ..services.evaluation import evaluate_signal_alignment

router = APIRouter(prefix="/evaluation", tags=["evaluation"])

@router.get("/signal-alignment", response_model=schemas.SignalAlignmentResponse)
def get_signal_alignment(baseline: str = "2024-01-01"):
    company_repo = get_company_repository()
    price_repo = get_stock_price_repository()
    
    all_companies = company_repo.list_all()
    # Filter to companies whose ticker is truthy
    valid_companies = [c for c in all_companies if c.get("ticker")]
    
    result = evaluate_signal_alignment(
        companies=valid_companies,
        price_repo=price_repo,
        baseline=baseline
    )
    
    return result
