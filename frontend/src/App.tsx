import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import ListPage from './pages/ListPage'
import DetailPage from './pages/DetailPage'
import InputPage from './pages/InputPage'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <nav className="bg-blue-900 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
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
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/list" element={<ListPage />} />
            <Route path="/themes/:id" element={<DetailPage />} />
            <Route path="/input" element={<InputPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
