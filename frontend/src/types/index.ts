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
