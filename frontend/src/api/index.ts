import axios from 'axios'
import type { Theme, Paper, PaperMonthlyCount, Patent, PatentYearlyCount, PatentTopAssignee, Company, SupplyChainItem, InstitutionalInvestor, DashboardData, ThemeExternalInfos, AlignmentScore, SignalAlignmentResponse, ResearchSeed, StockData, SignalReport, BacktestResponse, ThemeCitations, ThemeCitationMatrix } from '../types'

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
      window.location.href = '/login'
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

export const fetchThemeCitationMatrix = (years = 10) =>
  api.get<ThemeCitationMatrix>('/dashboard/theme-citation-matrix', { params: { years } }).then(r => r.data)

export const fetchThemeExternalInfos = (themeId: string) =>
  api.get<ThemeExternalInfos>(`/themes/${themeId}/external-infos`).then(r => r.data)

export const fetchThemeAlignment = (themeId: string) =>
  api.get<AlignmentScore>(`/themes/${themeId}/alignment`).then(r => r.data)

export const fetchSignalAlignment = (baseline?: string) =>
  api.get<SignalAlignmentResponse>('/evaluation/signal-alignment', { params: baseline ? { baseline } : {} }).then(r => r.data)

export const fetchResearchSeeds = () => api.get<ResearchSeed[]>('/research-seeds/').then(r => r.data)
