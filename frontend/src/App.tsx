import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/useAuth'
import { I18nProvider } from './i18n/I18nProvider'
import { useI18n } from './i18n/useI18n'
import LanguageToggle from './components/LanguageToggle'
import DashboardPage from './pages/DashboardPage'
import StatusPage from './pages/StatusPage'
import StockPage from './pages/StockPage'
import PapersPage from './pages/PapersPage'
import PatentsPage from './pages/PatentsPage'
import InvestorsPage from './pages/InvestorsPage'
import SignalDetectionPage from './pages/SignalDetectionPage'
import ListPage from './pages/ListPage'
import DetailPage from './pages/DetailPage'
import InputPage from './pages/InputPage'
import EvaluationPage from './pages/EvaluationPage'
import ResearchSeedsPage from './pages/ResearchSeedsPage'
import LoginPage from './pages/LoginPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'text-white font-semibold border-b-2 border-sky-400 pb-0.5'
    : 'text-slate-300 hover:text-white transition-colors'

function AppLayout() {
  const { isAuthenticated, logout } = useAuth()
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {isAuthenticated && (
        <nav className="bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 py-3">
            {/* Title row: title stays on a single line */}
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 font-bold text-lg tracking-tight whitespace-nowrap">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-extrabold text-white">S</span>
                Stock Signal Research
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <LanguageToggle />
                <button
                  onClick={logout}
                  className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded border border-white/30 whitespace-nowrap"
                >
                  {t('common.logout')}
                </button>
              </div>
            </div>
            {/* Menu row: single line, scrolls horizontally on overflow */}
            <div className="flex items-center gap-6 overflow-x-auto whitespace-nowrap pt-3">
              <NavLink to="/" end className={navLinkClass}>
                {t('nav.dashboard')}
              </NavLink>
              <NavLink to="/status" className={navLinkClass}>
                {t('nav.status')}
              </NavLink>
              <NavLink to="/stock" className={navLinkClass}>
                {t('nav.stock')}
              </NavLink>
              <NavLink to="/papers" className={navLinkClass}>
                {t('nav.papers')}
              </NavLink>
              <NavLink to="/patents" className={navLinkClass}>
                {t('nav.patents')}
              </NavLink>
              <NavLink to="/investors" className={navLinkClass}>
                {t('nav.investors')}
              </NavLink>
              <NavLink to="/signals" className={navLinkClass}>
                {t('nav.signals')}
              </NavLink>
              <NavLink to="/list" className={navLinkClass}>
                {t('nav.list')}
              </NavLink>
              <NavLink to="/input" className={navLinkClass}>
                {t('nav.input')}
              </NavLink>
              <NavLink to="/evaluation" className={navLinkClass}>
                {t('nav.evaluation')}
              </NavLink>
              <NavLink to="/research-seeds" className={navLinkClass}>
                {t('nav.researchSeeds')}
              </NavLink>
            </div>
          </div>
        </nav>
      )}
      <main className="w-full max-w-7xl mx-auto px-4 py-6 flex-1">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/status" element={<PrivateRoute><StatusPage /></PrivateRoute>} />
          <Route path="/stock" element={<PrivateRoute><StockPage /></PrivateRoute>} />
          <Route path="/papers" element={<PrivateRoute><PapersPage /></PrivateRoute>} />
          <Route path="/patents" element={<PrivateRoute><PatentsPage /></PrivateRoute>} />
          <Route path="/investors" element={<PrivateRoute><InvestorsPage /></PrivateRoute>} />
          <Route path="/signals" element={<PrivateRoute><SignalDetectionPage /></PrivateRoute>} />
          <Route path="/list" element={<PrivateRoute><ListPage /></PrivateRoute>} />
          <Route path="/themes/:id" element={<PrivateRoute><DetailPage /></PrivateRoute>} />
          <Route path="/input" element={<PrivateRoute><InputPage /></PrivateRoute>} />
          <Route path="/evaluation" element={<PrivateRoute><EvaluationPage /></PrivateRoute>} />
          <Route path="/research-seeds" element={<PrivateRoute><ResearchSeedsPage /></PrivateRoute>} />
        </Routes>
      </main>
      {isAuthenticated && (
        <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-400">
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
          <AppLayout />
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  )
}
