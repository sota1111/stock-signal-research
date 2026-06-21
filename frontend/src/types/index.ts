export interface Theme {
  id: string
  name: string
  category: string
  description?: string
  precursor_score: number
  is_trending: boolean
}

export interface Paper {
  id: string
  paper_id: string
  title: string
  url?: string
  published_at?: string
  abstract?: string
  theme_id?: string
  source: string
  citation_count: number
}

export interface PaperMonthlyCount {
  id: string
  theme_id: string
  keyword: string
  year_month: string
  count: number
  mom_change_pct: number
  yoy_change_pct: number
}

export interface Patent {
  id: string
  patent_id: string
  patent_number?: string
  title: string
  published_at?: string
  theme_id?: string
  assignee?: string
  inventors?: string
  cpc?: string
  kind?: string
  url?: string
  source: string
}

export interface PatentYearlyCount {
  theme_id: string
  year: string
  count: number
}

export interface PatentTopAssignee {
  assignee: string
  count: number
}

export interface Company {
  id: string
  name: string
  ticker?: string
  description?: string
  benefit_score: number
  benefit_type: string
  theme_ids?: string
}

export interface SupplyChainItem {
  id: string
  from_theme_id: string
  to_theme_id: string
  relationship: string
  description?: string
  order: number
  from_theme_name?: string
  to_theme_name?: string
}

export interface InstitutionalInvestor {
  id: string
  investor_name: string
  company_id: string
  ownership_pct: number
  change_pct: number
  report_date: string
  report_type: string
  notes?: string
  company_name?: string | null
}

export interface DashboardData {
  trending_themes: Theme[]
  top_keywords: { keyword: string; mom_change_pct: number; theme_name?: string }[]
  notable_companies: Company[]
  supply_chain_highlights: SupplyChainItem[]
  alignment_highlights: {
    high_alignment: AlignmentHighlight[]
    paper_only: { theme: Theme; precursor_score: number }[]
  }
}

export interface ExternalInfo {
  id: string
  info_id: string
  info_type: 'news' | 'announcement' | 'earnings'
  title: string
  url?: string
  summary?: string
  source_name?: string
  published_at?: string
  related_company?: string
  theme_id?: string
  relevance_score: number
}

export interface AlignmentScore {
  id: string
  theme_id: string
  score: number
  news_score: number
  announcement_score: number
  earnings_score: number
  confidence: number
  evidence_count: number
  calculated_at?: string
  top_evidence: ExternalInfo[]
}

export interface ThemeExternalInfos {
  news: ExternalInfo[]
  announcements: ExternalInfo[]
  earnings: ExternalInfo[]
}

export interface AlignmentHighlight {
  theme: Theme
  score: number
  confidence: number
}

export interface EvaluationWindowResult {
  window_days: number
  evaluated_count: number
  direction_hit_rate: number
  correlation: number
  avg_return_high_signal: number
  avg_return_low_signal: number
}

export interface CompanyWindowResult {
  window_days: number
  baseline_date: string
  baseline_close: number
  target_date: string
  target_close: number
  forward_return_pct: number
  predicted_direction: 'up' | 'down'
  actual_direction: 'up' | 'down'
  hit: boolean
}

export interface CompanyEvaluation {
  company_id: string
  name: string
  ticker: string
  signal_score: number
  results: CompanyWindowResult[]
}

export interface SignalAlignmentSummary {
  baseline: string
  windows: EvaluationWindowResult[]
}

export interface SignalAlignmentResponse {
  baseline: string
  summary: SignalAlignmentSummary
  companies: CompanyEvaluation[]
}

export interface ResearchSeedPaper {
  title: string
  authors?: string[]
  year?: number
  url?: string
  doi?: string
  arxivId?: string
  source?: string
  note?: string
}

export interface ResearchSeedStockEvent {
  date?: string
  eventType: string
  title: string
  summary: string
  url?: string
}

export interface ResearchSeed {
  id: string
  seed_id: string
  source_type?: string
  source_reference?: string
  symbol?: string
  company_name?: string
  theme: string
  related_keywords: string[]
  summary?: string
  papers: ResearchSeedPaper[]
  stock_events: ResearchSeedStockEvent[]
  hypothesis?: string
  reason_to_track?: string
  confidence?: 'low' | 'medium' | 'high'
  created_at?: string
  updated_at?: string
}

// 株価・財務（GET /api/dashboard/stock, yfinance / SOT-845）
export interface StockPricePoint {
  date: string
  close: number
}

export interface StockFinancials {
  market_cap?: number | null
  trailing_pe?: number | null
  forward_pe?: number | null
  dividend_yield?: number | null
  fifty_two_week_high?: number | null
  fifty_two_week_low?: number | null
}

export interface StockData {
  ticker: string
  name?: string | null
  currency?: string | null
  period: { years: number; from?: string | null; to?: string | null }
  prices: StockPricePoint[]
  financials: StockFinancials
  source: string
  fetched_at?: string | null
  error?: string | null
}

// 株価シグナル バックテスト（GET /api/dashboard/backtest, SOT-881）
export interface BacktestWindowResult {
  window_days: number
  evaluated: number
  hit_rate: number
  avg_return_pct: number
}

export interface BacktestSignalResult {
  key: string
  label: string
  direction: 'bullish' | 'bearish'
  occurrences: number
  windows: BacktestWindowResult[]
}

export interface BacktestResponse {
  ticker?: string | null
  windows: number[]
  params: {
    sma_short: number
    sma_long: number
    rsi_period: number
    rsi_lower: number
    rsi_upper: number
  }
  total_points: number
  signals: BacktestSignalResult[]
  error?: string | null
}

// シグナルレポート（GET /api/dashboard/signal-report, SOT-853）
export interface PaperYearCount {
  year: number
  count: number
}

export interface SurgingKeyword {
  keyword: string
  count_latest_year: number
  growth_rate: number
  related_paper_ids: string[]
}

export interface TopCompany {
  rank: number
  company: string
  score: number
  related_paper_count: number
  matched_keywords: string[]
  market_data_available: boolean
  evidence: { paper_id: string; title: string }[]
}

export interface SupplyChainGraphNode {
  id: string
  type: string
  label: string
}

export interface SupplyChainGraphEdge {
  source: string
  target: string
  relation: string
  evidence: string[]
}

export interface SignalReport {
  query: string
  period: { from_year: number; to_year: number }
  paper_counts_by_year: PaperYearCount[]
  surging_keywords: SurgingKeyword[]
  top_companies: TopCompany[]
  supply_chain_graph: {
    nodes: SupplyChainGraphNode[]
    edges: SupplyChainGraphEdge[]
  }
  paper_total: number
  generated_at?: string
}

// テーマ別 引用数集計（GET /api/dashboard/theme-citations, SOT-899）
export interface TopCitedPaper {
  paper_id: string
  title: string
  url: string
  abstract: string
  citation_count: number
}

export interface ThemeCitationSummary {
  theme_id: string | null
  theme_name: string
  total_citations: number
  paper_count: number
  top_papers: TopCitedPaper[]
}

export interface ThemeCitations {
  top_n: number
  total_citations: number
  themes: ThemeCitationSummary[]
  generated_at?: string
}

// テーマ×年 引用数マトリクス（GET /api/dashboard/theme-citation-matrix, SOT-944）
export interface ThemeCitationMatrixRow {
  theme_id: string | null
  theme_name: string
  total: number
  cells: number[]
}

export interface ThemeCitationMatrix {
  years: number[]
  rows: ThemeCitationMatrixRow[]
  column_totals: number[]
  grand_total: number
  generated_at?: string
}
