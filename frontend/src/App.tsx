import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/useAuth'
import DashboardPage from './pages/DashboardPage'
import StockPage from './pages/StockPage'
import PapersPage from './pages/PapersPage'
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
              <button
                onClick={logout}
                className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded border border-white/30 whitespace-nowrap flex-shrink-0"
              >
                ログアウト
              </button>
            </div>
            {/* Menu row: single line, scrolls horizontally on overflow */}
            <div className="flex items-center gap-6 overflow-x-auto whitespace-nowrap pt-3">
              <NavLink to="/" end className={navLinkClass}>
                ダッシュボード
              </NavLink>
              <NavLink to="/stock" className={navLinkClass}>
                株価
              </NavLink>
              <NavLink to="/papers" className={navLinkClass}>
                論文
              </NavLink>
              <NavLink to="/investors" className={navLinkClass}>
                投資家
              </NavLink>
              <NavLink to="/signals" className={navLinkClass}>
                前兆検知
              </NavLink>
              <NavLink to="/list" className={navLinkClass}>
                一覧
              </NavLink>
              <NavLink to="/input" className={navLinkClass}>
                登録
              </NavLink>
              <NavLink to="/evaluation" className={navLinkClass}>
                一致度評価
              </NavLink>
              <NavLink to="/research-seeds" className={navLinkClass}>
                初期リサーチ
              </NavLink>
            </div>
          </div>
        </nav>
      )}
      <main className="w-full max-w-7xl mx-auto px-4 py-6 flex-1">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/stock" element={<PrivateRoute><StockPage /></PrivateRoute>} />
          <Route path="/papers" element={<PrivateRoute><PapersPage /></PrivateRoute>} />
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
          Stock Signal Research — 技術トレンド前兆検知
        </footer>
      )}
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  )
}
