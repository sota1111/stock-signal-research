from pydantic import BaseModel, ConfigDict, Field
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


class ExternalInfoBase(BaseModel):
    info_id: str
    info_type: str
    title: str
    url: Optional[str] = None
    summary: Optional[str] = None
    source_name: Optional[str] = None
    published_at: Optional[str] = None
    related_company: Optional[str] = None
    theme_id: Optional[str] = None
    relevance_score: float = 0.0


class ExternalInfoCreate(ExternalInfoBase):
    pass


class ExternalInfoResponse(ExternalInfoBase):
    id: str
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class AlignmentScoreResponse(BaseModel):
    id: str
    theme_id: str
    score: float
    news_score: float
    announcement_score: float
    earnings_score: float
    confidence: float
    evidence_count: int
    calculated_at: Optional[datetime] = None
    top_evidence: List[ExternalInfoResponse] = []
    model_config = ConfigDict(from_attributes=True)


class ThemeExternalInfosResponse(BaseModel):
    news: List[ExternalInfoResponse]
    announcements: List[ExternalInfoResponse]
    earnings: List[ExternalInfoResponse]


class HighAlignmentHighlightResponse(BaseModel):
    theme: ThemeResponse
    score: float
    confidence: float


class PaperOnlyHighlightResponse(BaseModel):
    theme: ThemeResponse
    precursor_score: float


class AlignmentHighlightsResponse(BaseModel):
    high_alignment: List[HighAlignmentHighlightResponse] = Field(default_factory=list)
    paper_only: List[PaperOnlyHighlightResponse] = Field(default_factory=list)


class DashboardResponse(BaseModel):
    trending_themes: List[ThemeResponse]
    top_keywords: List[dict]
    notable_companies: List[CompanyResponse]
    supply_chain_highlights: List[SupplyChainResponse]
    alignment_highlights: AlignmentHighlightsResponse = Field(default_factory=AlignmentHighlightsResponse)


class StockPriceBase(BaseModel):
    ticker: str
    date: str
    close: float
    company_id: Optional[str] = None


class StockPriceCreate(StockPriceBase):
    pass


class StockPriceResponse(StockPriceBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


class EvaluationWindowResult(BaseModel):
    window_days: int
    evaluated_count: int
    direction_hit_rate: float
    correlation: float
    avg_return_high_signal: float
    avg_return_low_signal: float


class CompanyWindowResult(BaseModel):
    window_days: int
    baseline_date: str
    baseline_close: float
    target_date: str
    target_close: float
    forward_return_pct: float
    predicted_direction: str
    actual_direction: str
    hit: bool


class CompanyEvaluation(BaseModel):
    company_id: str
    name: str
    ticker: str
    signal_score: float
    results: List[CompanyWindowResult]


class SignalAlignmentSummary(BaseModel):
    baseline: str
    windows: List[EvaluationWindowResult]


class SignalAlignmentResponse(BaseModel):
    baseline: str
    summary: SignalAlignmentSummary
    companies: List[CompanyEvaluation]


class ResearchSeedResponse(BaseModel):
    id: str
    seed_id: str
    source_type: Optional[str] = None
    source_reference: Optional[str] = None
    symbol: Optional[str] = None
    company_name: Optional[str] = None
    theme: str
    related_keywords: List[str] = Field(default_factory=list)
    summary: Optional[str] = None
    papers: List[dict] = Field(default_factory=list)
    stock_events: List[dict] = Field(default_factory=list)
    hypothesis: Optional[str] = None
    reason_to_track: Optional[str] = None
    confidence: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


# --- Signal Report (投資前兆ダッシュボード用 統一JSON / SOT-837) ---


class SignalReportPeriod(BaseModel):
    from_year: int
    to_year: int


class PaperYearCount(BaseModel):
    year: int
    count: int


class SurgingKeyword(BaseModel):
    keyword: str
    count_latest_year: int
    growth_rate: float
    related_paper_ids: List[str] = Field(default_factory=list)


class CompanyEvidence(BaseModel):
    paper_id: str
    title: str = ""


class TopCompany(BaseModel):
    rank: int
    company: str
    score: float
    related_paper_count: int
    matched_keywords: List[str] = Field(default_factory=list)
    market_data_available: bool = False
    evidence: List[CompanyEvidence] = Field(default_factory=list)


class SupplyChainNode(BaseModel):
    id: str
    type: str
    label: str


class SupplyChainEdge(BaseModel):
    source: str
    target: str
    relation: str
    evidence: List[str] = Field(default_factory=list)


class SupplyChainGraph(BaseModel):
    nodes: List[SupplyChainNode] = Field(default_factory=list)
    edges: List[SupplyChainEdge] = Field(default_factory=list)


class SignalReportResponse(BaseModel):
    query: str
    period: SignalReportPeriod
    paper_counts_by_year: List[PaperYearCount] = Field(default_factory=list)
    surging_keywords: List[SurgingKeyword] = Field(default_factory=list)
    top_companies: List[TopCompany] = Field(default_factory=list)
    supply_chain_graph: SupplyChainGraph = Field(default_factory=SupplyChainGraph)
    paper_total: int = 0
    generated_at: Optional[str] = None


# --- 株価・財務取得（yfinance / SOT-842） ---
class StockPricePoint(BaseModel):
    date: str
    close: float


class StockFinancials(BaseModel):
    market_cap: Optional[int] = None
    trailing_pe: Optional[float] = None
    forward_pe: Optional[float] = None
    dividend_yield: Optional[float] = None
    fifty_two_week_high: Optional[float] = None
    fifty_two_week_low: Optional[float] = None


class StockDataPeriod(BaseModel):
    years: int
    from_: Optional[str] = Field(default=None, alias="from")
    to: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class StockDataResponse(BaseModel):
    ticker: str
    name: Optional[str] = None
    currency: Optional[str] = None
    period: StockDataPeriod
    prices: List[StockPricePoint] = Field(default_factory=list)
    financials: StockFinancials = Field(default_factory=StockFinancials)
    source: str = "yfinance"
    fetched_at: Optional[str] = None
    error: Optional[str] = None
