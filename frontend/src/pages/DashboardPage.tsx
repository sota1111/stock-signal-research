import { useQuery, useQueries } from '@tanstack/react-query'
import { fetchDashboard, fetchStock, fetchSignalReport, fetchMonthlyData, fetchBacktest } from '../api'
import type { Company, StockData } from '../types'
import ChartCard from '../components/charts/ChartCard'
import StockPriceLines from '../components/charts/StockPriceLines'
import NormalizedCompareLines from '../components/charts/NormalizedCompareLines'
import ReturnRankingBar from '../components/charts/ReturnRankingBar'
import ValuationScatter from '../components/charts/ValuationScatter'
import PaperCountsByYearBar from '../components/charts/PaperCountsByYearBar'
import MonthlyPapersLine from '../components/charts/MonthlyPapersLine'
import SurgingKeywordsBar from '../components/charts/SurgingKeywordsBar'
import CompanyScoreBar from '../components/charts/CompanyScoreBar'
import PapersVsPriceComposed from '../components/charts/PapersVsPriceComposed'
import SupplyChainGraphView from '../components/charts/SupplyChainGraphView'
import SignalBacktestTable from '../components/charts/SignalBacktestTable'
import type { StockItem } from '../components/charts/chartUtils'

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

  // 急増テーマTOPを既定queryにシグナルレポートを取得（B/C系チャート用）
  const reportQuery = data?.trending_themes?.[0]?.name ?? 'AI'
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', reportQuery],
    queryFn: () => fetchSignalReport(reportQuery),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })
  const { data: monthly } = useQuery({
    queryKey: ['papers-monthly'],
    queryFn: () => fetchMonthlyData(),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  // バックテスト: 注目企業の先頭ティッカーを対象に各シグナルの的中率/リターンを集計
  const backtestTicker = tickerCompanies[0]?.ticker
  const { data: backtest } = useQuery({
    queryKey: ['backtest', backtestTicker],
    queryFn: () => fetchBacktest(backtestTicker as string, 10),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!backtestTicker,
  })

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <span className="h-8 w-8 mb-3 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
      <p className="text-sm">読み込み中...</p>
    </div>
  )
  if (error || !data) return (
    <div className="mx-auto max-w-md text-center py-16">
      <div className="text-3xl mb-2" aria-hidden>⚠️</div>
      <p className="font-semibold text-slate-700">データの取得に失敗しました</p>
      <p className="text-sm text-slate-400 mt-1">時間をおいて再度お試しください。</p>
    </div>
  )

  // 株価チャート（A1-A4, C1）用の共通 items
  const stockItems: StockItem[] = tickerCompanies.map((c, i) => ({
    name: c.name,
    ticker: c.ticker,
    stock: stockQueries[i]?.data,
  }))
  const primaryStock = stockItems.find(it => it.stock && !it.stock.error && it.stock.prices.length > 0)

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
          <table className="w-full min-w-[480px] text-sm responsive-table">
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
                  <td className="px-4 py-2 text-gray-500" data-label="#">{i + 1}</td>
                  <td className="px-4 py-2 font-medium" data-label="キーワード">{kw.keyword}</td>
                  <td className="px-4 py-2 text-gray-600" data-label="テーマ">{kw.theme_name ?? '-'}</td>
                  <td className="px-4 py-2 text-right text-green-600 font-semibold whitespace-nowrap" data-label="前月比">+{kw.mom_change_pct.toFixed(1)}%</td>
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
        <h2 className="text-lg font-semibold text-gray-700 mb-3">シグナル バックテスト（過去10年）</h2>
        {!backtestTicker ? (
          <p className="text-sm text-gray-400">ティッカー登録済みの注目企業がありません。</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-2">
              対象: {backtest?.ticker ?? backtestTicker} — 各テクニカルシグナル発生後の的中率と平均リターン
            </p>
            <SignalBacktestTable data={backtest} />
          </>
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

      {/* === 株価グラフ（過去10年） === */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">株価グラフ（過去10年）</h2>
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">A1. 株価推移（注目企業ごと）</p>
          <StockPriceLines items={stockItems} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="A2. 正規化比較（開始日=100）" subtitle="注目企業の相対パフォーマンス">
            <NormalizedCompareLines items={stockItems} />
          </ChartCard>
          <ChartCard title="A3. 10年騰落率ランキング" subtitle="プラス=赤 / マイナス=青">
            <ReturnRankingBar items={stockItems} />
          </ChartCard>
        </div>
        <ChartCard title="A4. バリュエーション散布図" subtitle="横軸PER × 縦軸時価総額 / バブル=配当利回り">
          <ValuationScatter items={stockItems} />
        </ChartCard>
      </section>

      {/* === 論文・研究トレンド === */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">論文・研究トレンド</h2>
        <p className="text-xs text-gray-400 -mt-2">集計テーマ: {reportQuery}</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="B1. 年別論文件数（過去10年）">
            <PaperCountsByYearBar data={signalReport?.paper_counts_by_year ?? []} />
          </ChartCard>
          <ChartCard title="B2. 月次論文件数トレンド" subtitle="全テーマ合算">
            <MonthlyPapersLine data={monthly ?? []} />
          </ChartCard>
          <ChartCard title="B3. 急増キーワード" subtitle="成長率 上位10件">
            <SurgingKeywordsBar data={signalReport?.surging_keywords ?? []} />
          </ChartCard>
          <ChartCard title="B4. 注目企業 前兆スコア">
            <CompanyScoreBar data={signalReport?.top_companies ?? []} />
          </ChartCard>
        </div>
      </section>

      {/* === 論文 × 株価 クロス分析 === */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">論文 × 株価 クロス分析</h2>
        <ChartCard
          title="C1. 論文件数 vs 株価（2軸）"
          subtitle={`論文件数（棒・左軸）× 年末株価（線・右軸）${primaryStock ? ` / ${primaryStock.name}` : ''}`}
        >
          <PapersVsPriceComposed
            counts={signalReport?.paper_counts_by_year ?? []}
            stock={primaryStock?.stock}
            companyName={primaryStock?.name}
          />
        </ChartCard>
        <ChartCard title="C2. サプライチェーン連鎖図" subtitle="ノード/エッジ図">
          <SupplyChainGraphView
            nodes={signalReport?.supply_chain_graph?.nodes ?? []}
            edges={signalReport?.supply_chain_graph?.edges ?? []}
          />
        </ChartCard>
      </section>

      <p className="text-xs text-gray-400 border-t pt-4">
        ※ このツールは情報収集・分析支援を目的としています。投資判断は自己責任でお願いします。
      </p>
    </div>
  )
}
