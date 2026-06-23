import axios from 'axios'
import type { Theme, Paper, PaperMonthlyCount, Patent, PatentYearlyCount, PatentTopAssignee, Company, SupplyChainItem, InstitutionalInvestor, DashboardData, ThemeExternalInfos, AlignmentScore, SignalAlignmentResponse, ResearchSeed, StockData, SignalReport, BacktestResponse, ThemeCitations, ThemeCitationMatrix, CategoryPaperAverages, CategoryPaperCounts, CategoryListResponse, CategoryMarketCap, FinancialFundamentals, FundamentalsCompaniesResponse } from '../types'

const api = axios.create({ baseURL: '/api' })

// Add auth token to all requests
api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Redirect to login on 401
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token')
      // セッション切れ時に現在のパスを保持し、再ログイン後に元ページへ戻せるようにする（SOT-995 提案B-3）。
      const current = window.location.pathname + window.location.search
      if (window.location.pathname !== '/login') {
        window.location.href = `/login?redirect=${encodeURIComponent(current)}`
      } else {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export const fetchThemes = () => api.get<Theme[]>('/themes/').then(r => r.data)
export const fetchTheme = (id: string) => api.get<Theme>(`/themes/${id}`).then(r => r.data)
export const createTheme = (data: { name: string; category: string; description: string }) =>
  api.post<Theme>('/themes/', data).then(r => r.data)

export const fetchPapers = (themeId?: string) =>
  api.get<Paper[]>('/papers/', { params: themeId ? { theme_id: themeId } : {} }).then(r => r.data)
export const fetchMonthlyData = (themeId?: string) =>
  api.get<PaperMonthlyCount[]>('/papers/monthly', { params: themeId ? { theme_id: themeId } : {} }).then(r => r.data)
export const createPaper = (data: Partial<Paper> & { paper_id: string; title: string; source: string }) =>
  api.post<Paper>('/papers/', data).then(r => r.data)

export const fetchPatents = (themeId?: string) =>
  api.get<Patent[]>('/patents/', { params: themeId ? { theme_id: themeId } : {} }).then(r => r.data)
export const fetchPatentYearly = (themeId?: string) =>
  api.get<PatentYearlyCount[]>('/patents/yearly', { params: themeId ? { theme_id: themeId } : {} }).then(r => r.data)
export const fetchPatentTopAssignees = (themeId?: string, limit = 10) =>
  api.get<PatentTopAssignee[]>('/patents/top-assignees', { params: { ...(themeId ? { theme_id: themeId } : {}), limit } }).then(r => r.data)

export const fetchCompanies = () => api.get<Company[]>('/companies/').then(r => r.data)
export const createCompany = (data: { name: string; ticker?: string; description: string; benefit_score: number; benefit_type: string }) =>
  api.post<Company>('/companies/', data).then(r => r.data)

export const fetchSupplyChain = () => api.get<SupplyChainItem[]>('/supply-chain/').then(r => r.data)
export const fetchInvestors = () => api.get<InstitutionalInvestor[]>('/investors/').then(r => r.data)
export const fetchDashboard = () => api.get<DashboardData>('/dashboard/').then(r => r.data)

export const fetchStock = (ticker: string, years = 10) =>
  api.get<StockData>('/dashboard/stock', { params: { ticker, years } }).then(r => r.data)

export const fetchSignalReport = (query: string, fromYear?: number) =>
  api
    .get<SignalReport>('/dashboard/signal-report', {
      params: { query, ...(fromYear != null ? { from_year: fromYear } : {}) },
    })
    .then(r => r.data)

export const fetchBacktest = (ticker: string, years = 10) =>
  api.get<BacktestResponse>('/dashboard/backtest', { params: { ticker, years } }).then(r => r.data)

export const fetchThemeCitations = (topN = 100) =>
  api.get<ThemeCitations>('/dashboard/theme-citations', { params: { top_n: topN } }).then(r => r.data)

export const fetchThemeCitationMatrix = (years = 10, fromYear?: number) =>
  api
    .get<ThemeCitationMatrix>('/dashboard/theme-citation-matrix', {
      params: { years, ...(fromYear != null ? { from_year: fromYear } : {}) },
    })
    .then(r => r.data)

export const fetchCategoryPaperAverages = (fromYear?: number, toYear?: number) =>
  api
    .get<CategoryPaperAverages>('/dashboard/category-paper-averages', {
      params: {
        ...(fromYear != null ? { from_year: fromYear } : {}),
        ...(toYear != null ? { to_year: toYear } : {}),
      },
    })
    .then(r => r.data)

// 大カテゴリ内 テーマ別 年次論文数（SOT-1081 要件③④）
export const fetchCategoryPaperCounts = (category: string, fromYear?: number, toYear?: number) =>
  api
    .get<CategoryPaperCounts>('/dashboard/category-paper-counts', {
      params: {
        category,
        ...(fromYear != null ? { from_year: fromYear } : {}),
        ...(toYear != null ? { to_year: toYear } : {}),
      },
    })
    .then(r => r.data)

// カテゴリ別 真の歴史的時価総額（SOT-1056 / A-1 + B-3）
export const fetchCategories = () =>
  api.get<CategoryListResponse>('/dashboard/categories').then(r => r.data)

export const fetchCategoryMarketCap = (themeId: string, topN = 10) =>
  api
    .get<CategoryMarketCap>('/dashboard/category-market-cap', { params: { theme_id: themeId, top_n: topN } })
    .then(r => r.data)

// 財務ファンダメンタルズ時系列（SOT-1121 / 候補D・SEC EDGAR XBRL）
export const fetchFundamentalsCompanies = () =>
  api.get<FundamentalsCompaniesResponse>('/dashboard/fundamentals-companies').then(r => r.data)

export const fetchFinancialFundamentals = (ticker: string) =>
  api
    .get<FinancialFundamentals>('/dashboard/financial-fundamentals', { params: { ticker } })
    .then(r => r.data)

export const fetchThemeExternalInfos = (themeId: string) =>
  api.get<ThemeExternalInfos>(`/themes/${themeId}/external-infos`).then(r => r.data)

export const fetchThemeAlignment = (themeId: string) =>
  api.get<AlignmentScore>(`/themes/${themeId}/alignment`).then(r => r.data)

export const fetchSignalAlignment = (baseline?: string) =>
  api.get<SignalAlignmentResponse>('/evaluation/signal-alignment', { params: baseline ? { baseline } : {} }).then(r => r.data)

export const fetchResearchSeeds = () => api.get<ResearchSeed[]>('/research-seeds/').then(r => r.data)
