import axios from 'axios'
import type { Theme, Paper, PaperMonthlyCount, Company, SupplyChainItem, InstitutionalInvestor, DashboardData } from '../types'

const api = axios.create({ baseURL: '/api' })

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

export const fetchCompanies = () => api.get<Company[]>('/companies/').then(r => r.data)
export const createCompany = (data: { name: string; ticker?: string; description: string; benefit_score: number; benefit_type: string }) =>
  api.post<Company>('/companies/', data).then(r => r.data)

export const fetchSupplyChain = () => api.get<SupplyChainItem[]>('/supply-chain/').then(r => r.data)
export const fetchInvestors = () => api.get<InstitutionalInvestor[]>('/investors/').then(r => r.data)
export const fetchDashboard = () => api.get<DashboardData>('/dashboard/').then(r => r.data)
