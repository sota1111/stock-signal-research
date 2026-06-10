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
}
