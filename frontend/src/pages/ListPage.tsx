import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchThemes, fetchPapers, fetchCompanies, fetchInvestors } from '../api'

const TABS = ['テーマ', '論文', '企業', '投資家'] as const
type Tab = typeof TABS[number]

export default function ListPage() {
  const [tab, setTab] = useState<Tab>('テーマ')
  const navigate = useNavigate()

  const { data: themes } = useQuery({ queryKey: ['themes'], queryFn: fetchThemes, enabled: tab === 'テーマ' })
  const { data: papers } = useQuery({ queryKey: ['papers'], queryFn: () => fetchPapers(), enabled: tab === '論文' })
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: fetchCompanies, enabled: tab === '企業' })
  const { data: investors } = useQuery({ queryKey: ['investors'], queryFn: fetchInvestors, enabled: tab === '投資家' })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">一覧</h1>
      <div className="flex gap-2 mb-6 border-b">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'テーマ' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">テーマ名</th>
                <th className="px-4 py-2 text-left">カテゴリ</th>
                <th className="px-4 py-2 text-right">前兆スコア</th>
                <th className="px-4 py-2 text-center">トレンド</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {themes?.map(t => (
                <tr key={t.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="px-4 py-2 text-gray-500">{t.category}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${t.precursor_score >= 70 ? 'bg-red-500' : t.precursor_score >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}>
                      {t.precursor_score.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">{t.is_trending ? '🔥' : ''}</td>
                  <td className="px-4 py-2">
                    <button onClick={() => navigate(`/themes/${t.id}`)} className="text-blue-600 hover:underline text-xs">詳細</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === '論文' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">タイトル</th>
                <th className="px-4 py-2 text-left">公開日</th>
                <th className="px-4 py-2 text-left">ソース</th>
              </tr>
            </thead>
            <tbody>
              {papers?.map(p => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{p.title}</a> : p.title}
                  </td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{p.published_at ?? '-'}</td>
                  <td className="px-4 py-2 text-gray-500">{p.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === '企業' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">企業名</th>
                <th className="px-4 py-2 text-left">ティッカー</th>
                <th className="px-4 py-2 text-right">恩恵度スコア</th>
                <th className="px-4 py-2 text-center">恩恵タイプ</th>
              </tr>
            </thead>
            <tbody>
              {companies?.map(c => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-gray-500">{c.ticker ?? '-'}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">{c.benefit_score.toFixed(0)}</span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded ${c.benefit_type === 'direct' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {c.benefit_type === 'direct' ? '直接' : '間接'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === '投資家' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">投資家名</th>
                <th className="px-4 py-2 text-right">保有比率</th>
                <th className="px-4 py-2 text-right">変化</th>
                <th className="px-4 py-2 text-left">報告日</th>
                <th className="px-4 py-2 text-left">種別</th>
              </tr>
            </thead>
            <tbody>
              {investors?.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{inv.investor_name}</td>
                  <td className="px-4 py-2 text-right">{inv.ownership_pct.toFixed(2)}%</td>
                  <td className={`px-4 py-2 text-right ${inv.change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {inv.change_pct >= 0 ? '+' : ''}{inv.change_pct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2 text-gray-500">{inv.report_date}</td>
                  <td className="px-4 py-2 text-gray-500">{inv.report_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
