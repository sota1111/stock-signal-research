import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../api'

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 50 ? 'bg-yellow-500' : 'bg-green-500'
  return <span className={`${color} text-white text-xs px-2 py-1 rounded-full font-bold`}>{score.toFixed(0)}</span>
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })

  if (isLoading) return <div className="text-center py-12 text-gray-500">読み込み中...</div>
  if (error || !data) return <div className="text-center py-12 text-red-500">データの取得に失敗しました</div>

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">ダッシュボード - 技術トレンド前兆検知</h1>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">急増テーマ TOP5</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.trending_themes.map(theme => (
            <div key={theme.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-800">{theme.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{theme.category}</p>
                </div>
                <ScoreBadge score={theme.precursor_score} />
              </div>
              {theme.is_trending && (
                <span className="mt-2 inline-block text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">継続トレンド</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">急増キーワード ランキング</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">キーワード</th>
                <th className="px-4 py-2 text-left">テーマ</th>
                <th className="px-4 py-2 text-right">前月比</th>
              </tr>
            </thead>
            <tbody>
              {data.top_keywords.map((kw, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2 font-medium">{kw.keyword}</td>
                  <td className="px-4 py-2 text-gray-600">{kw.theme_name ?? '-'}</td>
                  <td className="px-4 py-2 text-right text-green-600 font-semibold">+{kw.mom_change_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">注目企業 TOP5</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.notable_companies.map(company => (
            <div key={company.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{company.name}</p>
                  {company.ticker && <p className="text-xs text-gray-500">{company.ticker}</p>}
                </div>
                <div className="text-right">
                  <ScoreBadge score={company.benefit_score} />
                  <p className="text-xs text-gray-500 mt-1">
                    <span className={company.benefit_type === 'direct' ? 'text-blue-600' : 'text-gray-500'}>
                      {company.benefit_type === 'direct' ? '直接恩恵' : '間接恩恵'}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">サプライチェーン連鎖</h2>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap gap-2 items-center">
            {data.supply_chain_highlights.map((item, i) => (
              <span key={item.id} className="flex items-center gap-2">
                {i === 0 && <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">{item.from_theme_name}</span>}
                <span className="text-gray-400">→</span>
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">{item.to_theme_name}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      <p className="text-xs text-gray-400 border-t pt-4">
        ※ このツールは情報収集・分析支援を目的としています。投資判断は自己責任でお願いします。
      </p>
    </div>
  )
}
