from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class ThemeBase(BaseModel):
    name: str
    category: str
    description: Optional[str] = None
    precursor_score: float = 0.0
    is_trending: bool = False

class ThemeCreate(ThemeBase):
    pass

class ThemeUpdate(ThemeBase):
    name: Optional[str] = None
    category: Optional[str] = None

class ThemeResponse(ThemeBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class PaperBase(BaseModel):
    paper_id: str
    title: str
    url: Optional[str] = None
    authors: Optional[str] = None
    published_at: Optional[str] = None
    abstract: Optional[str] = None
    extracted_keywords: Optional[str] = None
    theme_id: Optional[str] = None
    source: str = "manual"

class PaperCreate(PaperBase):
    pass

class PaperResponse(PaperBase):
    id: str
    model_config = ConfigDict(from_attributes=True)

class PaperMonthlyCountBase(BaseModel):
    theme_id: str
    keyword: str
    year_month: str
    count: int
    prev_month_count: int = 0
    prev_year_count: int = 0
    mom_change_pct: float = 0.0
    yoy_change_pct: float = 0.0

class PaperMonthlyCountCreate(PaperMonthlyCountBase):
    pass

class PaperMonthlyCountResponse(PaperMonthlyCountBase):
    id: str
    model_config = ConfigDict(from_attributes=True)

class CompanyBase(BaseModel):
    name: str
    ticker: Optional[str] = None
    description: Optional[str] = None
    benefit_score: float = 0.0
    benefit_type: str = "indirect"
    theme_ids: Optional[str] = None

class CompanyCreate(CompanyBase):
    pass

class CompanyResponse(CompanyBase):
    id: str
    model_config = ConfigDict(from_attributes=True)

class SupplyChainBase(BaseModel):
    from_theme_id: str
    to_theme_id: str
    relationship: str
    description: Optional[str] = None
    order: int = 0

class SupplyChainCreate(SupplyChainBase):
    pass

class SupplyChainResponse(SupplyChainBase):
    id: str
    from_theme_name: Optional[str] = None
    to_theme_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class InstitutionalInvestorBase(BaseModel):
    investor_name: str
    company_id: str
    ownership_pct: float
    change_pct: float
    report_date: str
    report_type: str
    notes: Optional[str] = None

class InstitutionalInvestorCreate(InstitutionalInvestorBase):
    pass

class InstitutionalInvestorResponse(InstitutionalInvestorBase):
    id: str
    company_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class DashboardResponse(BaseModel):
    trending_themes: List[ThemeResponse]
    top_keywords: List[dict]
    notable_companies: List[CompanyResponse]
    supply_chain_highlights: List[SupplyChainResponse]
