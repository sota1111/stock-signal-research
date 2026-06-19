import { useQuery } from '@tanstack/react-query'
import { fetchSignalAlignment } from '../api'

function HitBadge({ hit }: { hit: boolean }) {
  return (
    <span className={`${hit ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'} text-xs px-2 py-0.5 rounded font-medium`}>
      {hit ? '一致' : '不一致'}
    </span>
  )
}

function FormatPercent({ value, showPlus = false }: { value: number; showPlus?: boolean }) {
  const formatted = (value * 100).toFixed(1)
  const prefix = showPlus && value > 0 ? '+' : ''
  const color = value > 0 ? 'text-red-600' : value < 0 ? 'text-blue-600' : 'text-gray-600'
  return <span className={`font-semibold ${color}`}>{prefix}{formatted}%</span>
}

export default function EvaluationPage() {
  const { data, isLoading, error } = useQuery({ 
    queryKey: ['signal-alignment'], 
    queryFn: () => fetchSignalAlignment() 
  })

  if (isLoading) return <div className="text-center py-12 text-gray-500">読み込み中...</div>
  if (error || !data) return <div className="text-center py-12 text-red-500">データの取得に失敗しました</div>

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-gray-800">一致度評価 — 前兆スコア vs 実株価変動</h1>
        <p className="text-sm text-gray-500">基準日: {data.baseline}</p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md text-sm">
        <p className="font-semibold mb-1">【免責事項】</p>
        <p>本評価は分析支援を目的としたものであり、投資助言ではありません。過去の実績は将来の結果を保証するものではありません。</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">サマリー (ウィンドウ別)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.summary.windows.map(window => (
            <div key={window.window_days} className="bg-white rounded-lg shadow p-6 border-t-4 border-blue-600">
              <h3 className="text-xl font-bold text-gray-800 mb-4">{window.window_days}日 ウィンドウ</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">方向一致率</p>
                  <p className="text-2xl font-bold text-gray-900">{(window.direction_hit_rate * 100).toFixed(0)}%</p>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">相関</p>
                  <p className="text-2xl font-bold text-gray-900">{window.correlation.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">高シグナル平均リターン</p>
                  <p className="text-lg font-bold">
                    <FormatPercent value={window.avg_return_high_signal} showPlus />
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">低シグナル平均リターン</p>
                  <p className="text-lg font-bold">
                    <FormatPercent value={window.avg_return_low_signal} showPlus />
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-4 text-right">評価銘柄数: {window.evaluated_count}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">銘柄別パフォーマンス明細</h2>
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm responsive-table">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left">Ticker</th>
                <th className="px-4 py-3 text-left">銘柄名</th>
                <th className="px-4 py-3 text-right">シグナルスコア</th>
                {data.summary.windows.map(w => (
                  <th key={w.window_days} colSpan={2} className="px-4 py-3 text-center border-l">
                    {w.window_days}日リターン / 判定
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.companies.map(company => (
                <tr key={company.company_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-600" data-label="Ticker">{company.ticker}</td>
                  <td className="px-4 py-3 font-medium text-gray-900" data-label="銘柄名">{company.name}</td>
                  <td className="px-4 py-3 text-right" data-label="シグナルスコア">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold">
                      {company.signal_score.toFixed(1)}
                    </span>
                  </td>
                  {data.summary.windows.map(w => {
                    const result = company.results.find(r => r.window_days === w.window_days)
                    return (
                      <React.Fragment key={w.window_days}>
                        <td className="px-4 py-3 text-right border-l" data-label={`${w.window_days}日リターン`}>
                          {result ? <FormatPercent value={result.forward_return_pct} showPlus /> : '-'}
                        </td>
                        <td className="px-4 py-3 text-center" data-label={`${w.window_days}日判定`}>
                          {result ? <HitBadge hit={result.hit} /> : '-'}
                        </td>
                      </React.Fragment>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// React dependency for React.Fragment if not auto-imported
import React from 'react'
