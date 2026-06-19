import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/useAuth'
import DashboardPage from './pages/DashboardPage'
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
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {isAuthenticated && (
        <nav className="bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 font-bold text-lg tracking-tight">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-sky-400 to-indigo-500 text-sm font-extrabold text-white">S</span>
                Stock Signal Research
              </span>
              {/* Desktop: inline links */}
              <div className="hidden md:flex items-center gap-6">
                <NavLink to="/" end className={navLinkClass}>
                  ダッシュボード
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
              {/* Desktop: logout */}
              <button
                onClick={logout}
                className="hidden md:inline-block text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded border border-white/30"
              >
                ログアウト
              </button>
              {/* Mobile: hamburger toggle */}
              <button
                type="button"
                aria-label="メニュー"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(o => !o)}
                className="md:hidden p-2 -mr-2 rounded hover:bg-white/10"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {menuOpen ? (
                    <>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </>
                  ) : (
                    <>
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </>
                  )}
                </svg>
              </button>
            </div>
            {/* Mobile: collapsible menu */}
            {menuOpen && (
              <div className="md:hidden flex flex-col gap-3 pt-4 pb-1">
                <NavLink to="/" end onClick={closeMenu} className={navLinkClass}>
                  ダッシュボード
                </NavLink>
                <NavLink to="/list" onClick={closeMenu} className={navLinkClass}>
                  一覧
                </NavLink>
                <NavLink to="/input" onClick={closeMenu} className={navLinkClass}>
                  登録
                </NavLink>
                <NavLink to="/evaluation" onClick={closeMenu} className={navLinkClass}>
                  一致度評価
                </NavLink>
                <NavLink to="/research-seeds" onClick={closeMenu} className={navLinkClass}>
                  初期リサーチ
                </NavLink>
                <button
                  onClick={() => { closeMenu(); logout() }}
                  className="text-left text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded border border-white/30 self-start"
                >
                  ログアウト
                </button>
              </div>
            )}
          </div>
        </nav>
      )}
      <main className="w-full max-w-7xl mx-auto px-4 py-6 flex-1">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
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
