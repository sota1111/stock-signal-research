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
    citation_count: int = 0


class PaperCreate(PaperBase):
    pass


class PaperResponse(PaperBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


class PatentBase(BaseModel):
    patent_id: str
    patent_number: Optional[str] = None
    title: str
    published_at: Optional[str] = None
    theme_id: Optional[str] = None
    assignee: Optional[str] = None
    inventors: Optional[str] = None
    cpc: Optional[str] = None
    kind: Optional[str] = None
    url: Optional[str] = None
    source: str = "ppubs"


class PatentCreate(PatentBase):
    pass


class PatentResponse(PatentBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


class PatentYearlyCountResponse(BaseModel):
    theme_id: str
    year: str
    count: int = 0
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
    # SOT-1124: 構造化 edge メタ情報
    relation_type: str = "depends_on"
    confidence: float = 0.5
    evidence: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None


class SupplyChainCreate(SupplyChainBase):
    pass


class SupplyChainResponse(SupplyChainBase):
    id: str
    from_theme_name: Optional[str] = None
    to_theme_name: Optional[str] = None
    from_category: Optional[str] = None
    to_category: Optional[str] = None
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
    filings: List[ExternalInfoResponse] = []


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


# --- Theme citation aggregation (論文引用指標 / SOT-899) ---


class TopCitedPaper(BaseModel):
    paper_id: str = ""
    title: str = ""
    url: str = ""
    abstract: str = ""
    citation_count: int = 0


class ThemeCitationSummary(BaseModel):
    theme_id: Optional[str] = None
    theme_name: str
    total_citations: int = 0
    paper_count: int = 0
    top_papers: List[TopCitedPaper] = Field(default_factory=list)


class ThemeCitationsResponse(BaseModel):
    top_n: int = 100
    total_citations: int = 0
    themes: List[ThemeCitationSummary] = Field(default_factory=list)
    generated_at: Optional[str] = None


class ThemeCitationMatrixRow(BaseModel):
    theme_id: Optional[str] = None
    theme_name: str
    total: int = 0
    cells: List[int] = Field(default_factory=list)


class ThemeCitationMatrixResponse(BaseModel):
    years: List[int] = Field(default_factory=list)
    rows: List[ThemeCitationMatrixRow] = Field(default_factory=list)
    column_totals: List[int] = Field(default_factory=list)
    grand_total: int = 0
    generated_at: Optional[str] = None


class CategoryPaperAverageItem(BaseModel):
    category: str
    theme_count: int = 0
    averages: List[float] = Field(default_factory=list)
    total_papers: int = 0


class CategoryPaperAveragesResponse(BaseModel):
    years: List[int] = Field(default_factory=list)
    categories: List[CategoryPaperAverageItem] = Field(default_factory=list)
    generated_at: Optional[str] = None


# --- 大カテゴリ内 テーマ別 年次論文数（SOT-1081 要件③④） ---
class CategoryPaperCountsSeries(BaseModel):
    theme_id: Optional[str] = None
    theme_name: str
    total: int = 0
    counts: List[int] = Field(default_factory=list)


class CategoryPaperCountsResponse(BaseModel):
    category: Optional[str] = None
    years: List[int] = Field(default_factory=list)
    series: List[CategoryPaperCountsSeries] = Field(default_factory=list)
    generated_at: Optional[str] = None


# --- 株価・財務取得（同梱データ / SOT-842, SOT-941） ---
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
    source: str = "local-seed"
    fetched_at: Optional[str] = None
    error: Optional[str] = None


# --- カテゴリ別 真の歴史的時価総額グラフ（SOT-1056 / A-1 + B-3） ---
class CategoryMarketCapSeries(BaseModel):
    key: str  # ティッカー
    name: str
    currency: Optional[str] = None  # 上場通貨 (USD/KRW/JPY)
    exchange: Optional[str] = None  # 上場市場 (US/KRX/TSE)
    provenance: Optional[str] = None  # real(SEC実測) / approx(非米国USD換算近似)


class CategoryMarketCapPoint(BaseModel):
    year: int
    values: dict = Field(default_factory=dict)  # {ticker: market_cap}


class CategoryMarketCapResponse(BaseModel):
    theme_id: str
    theme_name: Optional[str] = None
    currency: str = "USD"
    note: str = ""
    series: List[CategoryMarketCapSeries] = Field(default_factory=list)
    years: List[int] = Field(default_factory=list)
    points: List[CategoryMarketCapPoint] = Field(default_factory=list)


class CategoryListItem(BaseModel):
    theme_id: str
    theme_name: Optional[str] = None
    category: Optional[str] = None
    company_count: int = 0
    has_market_cap: bool = False


class CategoryListResponse(BaseModel):
    categories: List[CategoryListItem] = Field(default_factory=list)


# --- 財務ファンダメンタルズ時系列（SOT-1121 / 候補D・SEC EDGAR XBRL） ---
class FinancialFundamentalsSeries(BaseModel):
    key: str  # 指標キー（revenue/gross_profit/rnd/capex）
    concept: Optional[str] = None  # 採用された XBRL concept（フォールバック解決結果）


class FinancialFundamentalsPoint(BaseModel):
    year: int
    values: dict = Field(default_factory=dict)  # {metricKey: value}


class FinancialFundamentalsResponse(BaseModel):
    ticker: str
    name: Optional[str] = None
    currency: str = "USD"
    note: str = ""
    series: List[FinancialFundamentalsSeries] = Field(default_factory=list)
    years: List[int] = Field(default_factory=list)
    points: List[FinancialFundamentalsPoint] = Field(default_factory=list)


class FundamentalsCompanyItem(BaseModel):
    ticker: str
    name: Optional[str] = None
    metric_count: int = 0
    has_data: bool = False


class FundamentalsCompaniesResponse(BaseModel):
    companies: List[FundamentalsCompanyItem] = Field(default_factory=list)


# --- 株価シグナル バックテスト（SOT-881） ---
class BacktestWindowResult(BaseModel):
    window_days: int
    evaluated: int
    hit_rate: float
    avg_return_pct: float


class BacktestSignalResult(BaseModel):
    key: str
    label: str
    direction: str
    occurrences: int
    windows: List[BacktestWindowResult] = Field(default_factory=list)


class BacktestParams(BaseModel):
    sma_short: int
    sma_long: int
    rsi_period: int
    rsi_lower: float
    rsi_upper: float


class BacktestResponse(BaseModel):
    ticker: Optional[str] = None
    windows: List[int] = Field(default_factory=list)
    params: BacktestParams
    total_points: int = 0
    signals: List[BacktestSignalResult] = Field(default_factory=list)
    error: Optional[str] = None
