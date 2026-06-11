from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/", response_model=schemas.DashboardResponse)
def get_dashboard(db: Session = Depends(get_db)):
    # trending_themes: top 5 themes by precursor_score
    trending_themes = db.query(models.Theme).order_by(models.Theme.precursor_score.desc()).limit(5).all()
    
    # top_keywords: top 10 PaperMonthlyCount by mom_change_pct (add theme_name field)
    pm_counts = db.query(models.PaperMonthlyCount).order_by(models.PaperMonthlyCount.mom_change_pct.desc()).limit(10).all()
    top_keywords = []
    for pm in pm_counts:
        theme = db.query(models.Theme).filter(models.Theme.id == pm.theme_id).first()
        top_keywords.append({
            "keyword": pm.keyword,
            "mom_change_pct": pm.mom_change_pct,
            "theme_name": theme.name if theme else "Unknown"
        })
        
    # notable_companies: top 5 by benefit_score
    notable_companies = db.query(models.Company).order_by(models.Company.benefit_score.desc()).limit(5).all()
    
    # supply_chain_highlights: all supply chain items ordered by order
    sc_results = db.query(models.SupplyChain).order_by(models.SupplyChain.order).all()
    supply_chain_highlights = []
    for item in sc_results:
        from_theme = db.query(models.Theme).filter(models.Theme.id == item.from_theme_id).first()
        to_theme = db.query(models.Theme).filter(models.Theme.id == item.to_theme_id).first()
        
        res_item = schemas.SupplyChainResponse.model_validate(item)
        res_item.from_theme_name = from_theme.name if from_theme else None
        res_item.to_theme_name = to_theme.name if to_theme else None
        supply_chain_highlights.append(res_item)
        
    # alignment_highlights
    alignment_rows = db.query(models.AlignmentScore).order_by(
        models.AlignmentScore.score.desc()
    ).limit(10).all()

    high_alignment = []
    paper_only_ids = set()
    for row in alignment_rows:
        theme = db.query(models.Theme).filter(models.Theme.id == row.theme_id).first()
        if not theme:
            continue
        if row.score >= 30:
            high_alignment.append({"theme": theme, "score": row.score, "confidence": row.confidence})
            paper_only_ids.add(theme.id)

    paper_only = []
    for theme in db.query(models.Theme).order_by(models.Theme.precursor_score.desc()).limit(10).all():
        if theme.id not in paper_only_ids and theme.precursor_score >= 20:
            paper_only.append({"theme": theme, "precursor_score": theme.precursor_score})
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
