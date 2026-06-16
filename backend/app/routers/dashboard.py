from fastapi import APIRouter
from .. import schemas
from ..repositories.theme_repository import get_theme_repository
from ..repositories.company_repository import get_company_repository
from ..repositories.score_repository import get_score_repository
from ..repositories.supply_chain_repository import get_supply_chain_repository
from ..repositories.trend_repository import get_trend_repository

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/", response_model=schemas.DashboardResponse)
def get_dashboard():
    theme_repo = get_theme_repository()
    company_repo = get_company_repository()
    score_repo = get_score_repository()
    sc_repo = get_supply_chain_repository()
    trend_repo = get_trend_repository()
    
    # trending_themes: top 5 themes by precursor_score
    trending_themes = theme_repo.list_all()[:5]
    
    # top_keywords: top 10 PaperMonthlyCount by mom_change_pct (add theme_name field)
    pm_counts = trend_repo.list_monthly_counts(limit=10)
    top_keywords = []
    for pm in pm_counts:
        theme = theme_repo.get_by_id(pm["theme_id"])
        top_keywords.append({
            "keyword": pm["keyword"],
            "mom_change_pct": pm["mom_change_pct"],
            "theme_name": theme["name"] if theme else "Unknown"
        })
        
    # notable_companies: top 5 by benefit_score
    notable_companies = company_repo.list_all()[:5]
    
    # supply_chain_highlights: all supply chain items ordered by order
    sc_results = sc_repo.list_all()
    supply_chain_highlights = []
    for item in sc_results:
        from_theme = theme_repo.get_by_id(item["from_theme_id"])
        to_theme = theme_repo.get_by_id(item["to_theme_id"])
        
        res_item = schemas.SupplyChainResponse.model_validate(item)
        res_item.from_theme_name = from_theme["name"] if from_theme else None
        res_item.to_theme_name = to_theme["name"] if to_theme else None
        supply_chain_highlights.append(res_item)
        
    # alignment_highlights
    alignment_rows = score_repo.list_top(10)

    high_alignment = []
    paper_only_ids = set()
    for row in alignment_rows:
        theme = theme_repo.get_by_id(row["theme_id"])
        if not theme:
            continue
        if row["score"] >= 30:
            high_alignment.append({"theme": theme, "score": row["score"], "confidence": row["confidence"]})
            paper_only_ids.add(theme["id"])

    paper_only = []
    # Re-using trending_themes or fetching more if needed
    all_themes = theme_repo.list_all()
    for theme in all_themes[:20]: # Check top 20 for paper_only
        if theme["id"] not in paper_only_ids and theme["precursor_score"] >= 20:
            paper_only.append({"theme": theme, "precursor_score": theme["precursor_score"]})
        if len(paper_only) >= 5:
            break

    alignment_highlights = {
        "high_alignment": high_alignment[:5],
        "paper_only": paper_only[:5],
    }

    return {
        "trending_themes": trending_themes,
        "top_keywords": top_keywords,
        "notable_companies": notable_companies,
        "supply_chain_highlights": supply_chain_highlights,
        "alignment_highlights": alignment_highlights
    }
