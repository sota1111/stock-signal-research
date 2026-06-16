import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/useAuth'
import DashboardPage from './pages/DashboardPage'
import ListPage from './pages/ListPage'
import DetailPage from './pages/DetailPage'
import InputPage from './pages/InputPage'
import EvaluationPage from './pages/EvaluationPage'
import LoginPage from './pages/LoginPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppLayout() {
  const { isAuthenticated, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated && (
        <nav className="bg-blue-900 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="font-bold text-lg">Stock Signal Research</span>
              <NavLink to="/" end className={({ isActive }) => isActive ? 'text-yellow-300 font-semibold' : 'hover:text-blue-200'}>
                ダッシュボード
              </NavLink>
              <NavLink to="/list" className={({ isActive }) => isActive ? 'text-yellow-300 font-semibold' : 'hover:text-blue-200'}>
                一覧
              </NavLink>
              <NavLink to="/input" className={({ isActive }) => isActive ? 'text-yellow-300 font-semibold' : 'hover:text-blue-200'}>
                登録
              </NavLink>
              <NavLink to="/evaluation" className={({ isActive }) => isActive ? 'text-yellow-300 font-semibold' : 'hover:text-blue-200'}>
                一致度評価
              </NavLink>
            </div>
            <button
              onClick={logout}
              className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded border border-white/30"
            >
              ログアウト
            </button>
          </div>
        </nav>
      )}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
          <Route path="/list" element={<PrivateRoute><ListPage /></PrivateRoute>} />
          <Route path="/themes/:id" element={<PrivateRoute><DetailPage /></PrivateRoute>} />
          <Route path="/input" element={<PrivateRoute><InputPage /></PrivateRoute>} />
          <Route path="/evaluation" element={<PrivateRoute><EvaluationPage /></PrivateRoute>} />
        </Routes>
      </main>
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
