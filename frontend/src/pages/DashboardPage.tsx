import { useQuery, useQueries } from '@tanstack/react-query'
import { fetchDashboard, fetchStock } from '../api'
import type { Company, StockData } from '../types'

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-red-500' : score >= 50 ? 'bg-yellow-500' : 'bg-green-500'
  return <span className={`${color} text-white text-xs px-2 py-1 rounded-full font-bold`}>{score.toFixed(0)}</span>
}

function formatPrice(value: number, currency?: string | null) {
  const symbol = currency === 'JPY' ? '¥' : currency === 'USD' ? '$' : ''
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${symbol ? '' : ` ${currency ?? ''}`.trimEnd()}`
}

function formatMarketCap(value?: number | null) {
  if (value == null) return '-'
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  return value.toLocaleString()
}

function StockEvalCard({ company, stock, isLoading, isError }: { company: Company; stock?: StockData; isLoading: boolean; isError: boolean }) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 animate-pulse">
        <p className="font-semibold text-gray-800">{company.name}</p>
        <p className="text-xs text-gray-400 mt-2">株価読み込み中...</p>
      </div>
    )
  }

  const failed = isError || !stock || stock.error || stock.prices.length === 0
  if (failed) {
    return (
      <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-300">
        <div className="flex justify-between items-start">
          <p className="font-semibold text-gray-800">{company.name}</p>
          {company.ticker && <span className="text-xs text-gray-500">{company.ticker}</span>}
        </div>
        <p className="text-xs text-gray-400 mt-2">株価取得失敗{stock?.error ? `（${stock.error}）` : ''}</p>
      </div>
    )
  }

  const first = stock.prices[0].close
  const last = stock.prices[stock.prices.length - 1].close
  const changePct = first !== 0 ? ((last - first) / first) * 100 : 0
  const changeColor = changePct >= 0 ? 'text-red-600' : 'text-blue-600'

  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-gray-800">{company.name}</p>
          <p className="text-xs text-gray-500">{stock.ticker}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-800">{formatPrice(last, stock.currency)}</p>
          <p className="text-xs text-gray-400">最新終値</p>
        </div>
      </div>
      <div className="flex justify-between items-center mt-3 text-sm">
        <span className="text-gray-500">10年騰落率</span>
        <span className={`font-bold ${changeColor}`}>{changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%</span>
      </div>
      <div className="flex justify-between items-center mt-1 text-xs text-gray-500">
        <span>時価総額 {formatMarketCap(stock.financials.market_cap)}</span>
        <span>PER {stock.financials.trailing_pe != null ? stock.financials.trailing_pe.toFixed(1) : '-'}</span>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })

  const tickerCompanies = (data?.notable_companies ?? []).filter((c): c is Company & { ticker: string } => !!c.ticker)
  const stockQueries = useQueries({
    queries: tickerCompanies.map(c => ({
      queryKey: ['stock', c.ticker, 10],
      queryFn: () => fetchStock(c.ticker, 10),
      staleTime: 1000 * 60 * 30,
      retry: 1,
    })),
  })

  if (isLoading) return <div className="text-center py-12 text-gray-500">読み込み中...</div>
  if (error || !data) return <div className="text-center py-12 text-red-500">データの取得に失敗しました</div>

  return (
    <div className="space-y-8">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-800">ダッシュボード - 技術トレンド前兆検知</h1>

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

      {data.alignment_highlights && (data.alignment_highlights.high_alignment?.length > 0 || data.alignment_highlights.paper_only?.length > 0) && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">外部情報との一致度 — 前兆候補</h2>
          <div className="space-y-3">
            {/* High alignment themes */}
            {data.alignment_highlights.high_alignment?.length > 0 && (
              <div>
                <p className="text-xs text-blue-600 font-medium mb-2">論文トレンド + 外部情報一致</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.alignment_highlights.high_alignment.map(item => (
                    <div key={item.theme.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800">{item.theme.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.theme.category}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="block bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            一致度 {item.score.toFixed(0)}
                          </span>
                          <span className="block text-xs text-gray-500">
                            信頼度 {item.confidence >= 0.8 ? '高' : item.confidence >= 0.5 ? '中' : '低'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-blue-700 mt-2">前兆候補</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Paper-only themes */}
            {data.alignment_highlights.paper_only?.length > 0 && (
              <div>
                <p className="text-xs text-orange-600 font-medium mb-2">論文トレンドのみ高い（外部情報との一致度は未確認）</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.alignment_highlights.paper_only.map(item => (
                    <div key={item.theme.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-400">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800">{item.theme.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.theme.category}</p>
                        </div>
                        <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-bold">
                          前兆スコア {item.precursor_score.toFixed(0)}
                        </span>
                      </div>
                      <p className="text-xs text-orange-600 mt-2">関連候補</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">急増キーワード ランキング</h2>
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">キーワード</th>
                <th className="px-4 py-2 text-left">テーマ</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">前月比</th>
              </tr>
            </thead>
            <tbody>
              {data.top_keywords.map((kw, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-2 font-medium">{kw.keyword}</td>
                  <td className="px-4 py-2 text-gray-600">{kw.theme_name ?? '-'}</td>
                  <td className="px-4 py-2 text-right text-green-600 font-semibold whitespace-nowrap">+{kw.mom_change_pct.toFixed(1)}%</td>
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
        <h2 className="text-lg font-semibold text-gray-700 mb-3">株価評価（過去10年）</h2>
        {tickerCompanies.length === 0 ? (
          <p className="text-sm text-gray-400">ティッカー登録済みの注目企業がありません。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tickerCompanies.map((company, i) => {
              const q = stockQueries[i]
              return (
                <StockEvalCard
                  key={company.id}
                  company={company}
                  stock={q?.data}
                  isLoading={q?.isLoading ?? false}
                  isError={q?.isError ?? false}
                />
              )
            })}
          </div>
        )}
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
