import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/useAuth'
import { FilterProvider } from './contexts/FilterProvider'
import { I18nProvider } from './i18n/I18nProvider'
import { useI18n } from './i18n/useI18n'
import type { MessageKey } from './i18n/messages'
import LanguageToggle from './components/LanguageToggle'
import { PageLoading } from './components/AsyncState'
import RouteErrorBoundary from './components/RouteErrorBoundary'

// ページコンポーネントは React.lazy で動的 import し、ルート単位でチャンク分割する（SOT-1000 / 提案A-5）。
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const StatusPage = lazy(() => import('./pages/StatusPage'))
const StockPage = lazy(() => import('./pages/StockPage'))
const PapersPage = lazy(() => import('./pages/PapersPage'))
const PatentsPage = lazy(() => import('./pages/PatentsPage'))
const InvestorsPage = lazy(() => import('./pages/InvestorsPage'))
const InvestmentCandidatesPage = lazy(() => import('./pages/InvestmentCandidatesPage'))
const SignalDetectionPage = lazy(() => import('./pages/SignalDetectionPage'))
const ListPage = lazy(() => import('./pages/ListPage'))
const DetailPage = lazy(() => import('./pages/DetailPage'))
const InputPage = lazy(() => import('./pages/InputPage'))
const EvaluationPage = lazy(() => import('./pages/EvaluationPage'))
const ResearchSeedsPage = lazy(() => import('./pages/ResearchSeedsPage'))
const SupplyChainPage = lazy(() => import('./pages/SupplyChainPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  // 認証チェック中はリダイレクトせず待つ（有効セッションを誤って /login に飛ばさない / SOT-995 提案B-3）。
  if (loading) return <PageLoading />
  // 未認証確定時のみ /login へ。元のパスを state.from に保持してログイン後に復帰させる。
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  return <>{children}</>
}

// ナビゲーションはグループ化せず、全項目をフラットなリストで表示する（SOT-1067）。
// /login と /themes/:id はルートだがナビには出さない。
type NavItem = { to: string; label: MessageKey; end?: boolean }

// ナビ順序（SOT-1001 / SOT-995 提案B）:
// dashboard → signals（ダッシュボード隣）→ themes（3番目相当）… → status（最後尾）。
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'nav.dashboard', end: true },
  { to: '/signals', label: 'nav.signals' },
  { to: '/supply-chain', label: 'nav.supplyChain' },
  { to: '/list?tab=themes', label: 'nav.themes' },
  { to: '/papers', label: 'nav.papers' },
  { to: '/patents', label: 'nav.patents' },
  { to: '/stock', label: 'nav.stock' },
  { to: '/investors', label: 'nav.investors' },
  { to: '/candidates', label: 'nav.candidates' },
  { to: '/evaluation', label: 'nav.evaluation' },
  { to: '/list', label: 'nav.list' },
  { to: '/input', label: 'nav.input' },
  { to: '/research-seeds', label: 'nav.researchSeeds' },
  { to: '/status', label: 'nav.status' },
]

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'text-white font-semibold border-b-2 border-sky-400 pb-0.5'
    : 'text-slate-300 hover:text-white transition-colors'

function AppLayout() {
  const { isAuthenticated, logout } = useAuth()
  const { t } = useI18n()
  // モバイルではホバー型ドロップダウンが開きにくいため、ハンバーガー→ドロワーで全項目を縦並び表示する（SOT-1020 / 提案3）。
  const [mobileOpenRoute, setMobileOpenRoute] = useState<string | null>(null)
  const location = useLocation()
  const currentRoute = `${location.pathname}${location.search}`
  const mobileOpen = mobileOpenRoute === currentRoute

  return (
    <div className="min-h-screen bg-surface-muted font-sans text-foreground flex flex-col">
      {/* Thin global accent bar (SOT-1019 / proposal 5): a single brand hairline above the nav. */}
      {isAuthenticated && <div className="h-0.5 bg-brand sticky top-0 z-20" aria-hidden />}
      {isAuthenticated && (
        <nav className="bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md sticky top-0.5 z-20">
          <div className="max-w-7xl mx-auto px-4 py-3">
            {/* Title row: title stays on a single line */}
            <div className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-2 font-bold text-lg tracking-tight whitespace-nowrap">
                <span className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-extrabold text-white">S</span>
                <span className="truncate">Stock Signal Research</span>
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <LanguageToggle />
                <button
                  onClick={logout}
                  className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded border border-white/30 whitespace-nowrap"
                >
                  {t('common.logout')}
                </button>
                {/* ハンバーガー（モバイルのみ） */}
                <button
                  type="button"
                  onClick={() => setMobileOpenRoute(route => route === currentRoute ? null : currentRoute)}
                  aria-label={mobileOpen ? t('nav.closeMenu') : t('nav.menu')}
                  aria-expanded={mobileOpen}
                  aria-controls="mobile-nav-drawer"
                  className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded border border-white/30 bg-white/10 hover:bg-white/20"
                >
                  <span aria-hidden className="text-lg leading-none">{mobileOpen ? '✕' : '☰'}</span>
                </button>
              </div>
            </div>
            {/* Menu row (desktop/tablet): flat list of nav items (SOT-1067). Hidden on mobile in favor of the drawer. */}
            <div className="hidden sm:flex flex-wrap items-center gap-3 sm:gap-6 pt-3">
              {NAV_ITEMS.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
                  {t(item.label)}
                </NavLink>
              ))}
            </div>
            {/* Mobile drawer: all items as a flat vertical list (SOT-1067). */}
            {mobileOpen && (
              <div id="mobile-nav-drawer" className="sm:hidden pt-3 flex flex-col">
                {NAV_ITEMS.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpenRoute(null)}
                    className={({ isActive }) =>
                      isActive
                        ? 'rounded px-3 py-2 text-sm font-semibold text-white bg-white/10'
                        : 'rounded px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white'
                    }
                  >
                    {t(item.label)}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>
      )}
      <main className="w-full max-w-7xl mx-auto px-4 py-6 flex-1 nums">
        <RouteErrorBoundary key={location.pathname}>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
              <Route path="/status" element={<PrivateRoute><StatusPage /></PrivateRoute>} />
              <Route path="/stock" element={<PrivateRoute><StockPage /></PrivateRoute>} />
              <Route path="/papers" element={<PrivateRoute><PapersPage /></PrivateRoute>} />
              <Route path="/patents" element={<PrivateRoute><PatentsPage /></PrivateRoute>} />
              <Route path="/investors" element={<PrivateRoute><InvestorsPage /></PrivateRoute>} />
              <Route path="/candidates" element={<PrivateRoute><InvestmentCandidatesPage /></PrivateRoute>} />
              <Route path="/signals" element={<PrivateRoute><SignalDetectionPage /></PrivateRoute>} />
              <Route path="/list" element={<PrivateRoute><ListPage /></PrivateRoute>} />
              <Route path="/themes/:id" element={<PrivateRoute><DetailPage /></PrivateRoute>} />
              <Route path="/input" element={<PrivateRoute><InputPage /></PrivateRoute>} />
              <Route path="/evaluation" element={<PrivateRoute><EvaluationPage /></PrivateRoute>} />
              <Route path="/research-seeds" element={<PrivateRoute><ResearchSeedsPage /></PrivateRoute>} />
              <Route path="/supply-chain" element={<PrivateRoute><SupplyChainPage /></PrivateRoute>} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </main>
      {isAuthenticated && (
        <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
          {t('footer.tagline')}
        </footer>
      )}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <FilterProvider>
            <AppLayout />
          </FilterProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  )
}
