import type { ReactNode } from 'react'
import { useState } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchDashboard, fetchStock, fetchSignalReport, fetchBacktest } from '../api'
import type { Company, StockData } from '../types'
import ScoreBadge from '../components/ScoreBadge'
import ChartCard from '../components/charts/ChartCard'
import UnifiedThemeCrossChart from '../components/charts/UnifiedThemeCrossChart'
import StockPriceLines from '../components/charts/StockPriceLines'
import NormalizedCompareLines from '../components/charts/NormalizedCompareLines'
import ReturnRankingBar from '../components/charts/ReturnRankingBar'
import ValuationScatter from '../components/charts/ValuationScatter'
import PapersVsPriceComposed from '../components/charts/PapersVsPriceComposed'
import SupplyChainGraphView from '../components/charts/SupplyChainGraphView'
import SignalBacktestTable from '../components/charts/SignalBacktestTable'
import type { StockItem } from '../components/charts/chartUtils'

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
  const queryClient = useQueryClient()
  const [selectedTheme, setSelectedTheme] = useState<string>('')
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

  // テーマ選択（選択でグラフが切り替わる）。未選択時は注目テーマの先頭。
  const reportQuery = selectedTheme || data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', reportQuery],
    queryFn: () => fetchSignalReport(reportQuery),
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

  // === サマリ帯（状態・次アクション・重要指標）用の集計 ===
  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['signal-report'] })
    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['backtest'] })
  }

  const trendingCount = data.trending_themes.length
  const companyCount = data.notable_companies.length
  const topKeyword = data.top_keywords[0]
  const paperCounts = signalReport?.paper_counts_by_year ?? []
  const paperTotal = signalReport?.paper_total ?? (paperCounts.length ? paperCounts.reduce((s, p) => s + p.count, 0) : null)
  const lastAnalyzed = signalReport?.generated_at ? new Date(signalReport.generated_at).toLocaleString('ja-JP') : '—'

  const tickerTotal = tickerCompanies.length
  const stockSettled = stockQueries.filter(q => !q.isLoading).length
  const stockSuccess = stockQueries.filter(q => q.data && !q.data.error && q.data.prices.length > 0).length
  const anyStockError = tickerTotal > 0 && stockSettled === tickerTotal && stockSuccess < tickerTotal
  const successRate = tickerTotal > 0 && stockSettled === tickerTotal ? Math.round((stockSuccess / tickerTotal) * 100) : null

  type StatusKey = 'ok' | 'warning' | 'empty'
  const statusKey: StatusKey =
    companyCount === 0 && trendingCount === 0 ? 'empty' : anyStockError ? 'warning' : 'ok'
  const statusConfig: Record<StatusKey, { border: string; dot: string; label: string; message: string; action: ReactNode }> = {
    ok: {
      border: 'border-emerald-500', dot: 'bg-emerald-500', label: '正常',
      message: '分析データを取得できています。前兆シグナルを確認できます。',
      action: <Link to="/signals" className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">前兆検知を見る →</Link>,
    },
    warning: {
      border: 'border-amber-500', dot: 'bg-amber-500', label: '警告',
      message: '一部の株価データ取得に失敗しています。時間をおいて再取得してください。',
      action: <button onClick={refetchAll} className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">再取得</button>,
    },
    empty: {
      border: 'border-gray-400', dot: 'bg-gray-400', label: 'データなし',
      message: 'テーマ・企業データがまだありません。初期リサーチを実行するとダッシュボードに反映されます。',
      action: <Link to="/research-seeds" className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">初期リサーチを実行 →</Link>,
    },
  }
  const status = statusConfig[statusKey]

  const kpis: { label: string; value: string; hint?: string }[] = [
    { label: '注目テーマ', value: trendingCount > 0 ? `${trendingCount}` : '—', hint: '件' },
    { label: '注目企業', value: companyCount > 0 ? `${companyCount}` : '—', hint: '社' },
    { label: '急増キーワード', value: topKeyword?.keyword ?? '—', hint: topKeyword ? `${topKeyword.mom_change_pct >= 0 ? '+' : ''}${topKeyword.mom_change_pct.toFixed(0)}% MoM` : undefined },
    { label: '10年論文件数', value: paperTotal != null ? paperTotal.toLocaleString() : '—', hint: '件' },
    ...(tickerTotal > 0 ? [{ label: '株価取得成功率', value: successRate != null ? `${successRate}%` : '…', hint: `${stockSuccess}/${tickerTotal}` }] : []),
  ]

  return (
    <div className="space-y-8">
      {/* === サマリ帯：状態・次アクション・重要指標 === */}
      <section className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">投資前兆リサーチ ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-0.5">投資前兆を論文 × 企業 × 株価から検知</p>
          <p className="text-xs text-gray-400 mt-1">最終分析日時: {lastAnalyzed}</p>
        </div>

        <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${status.border}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold text-gray-800">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${status.dot}`} aria-hidden />
                状態: {status.label}
              </p>
              <p className="text-sm text-gray-500 mt-1">{status.message}</p>
            </div>
            <div className="shrink-0">{status.action}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-white rounded-lg shadow p-3">
              <p className="text-xs text-gray-500">{kpi.label}</p>
              <p className="text-lg sm:text-xl font-bold text-gray-800 mt-1 truncate" title={kpi.value}>{kpi.value}</p>
              {kpi.hint && <p className="text-xs text-gray-400 mt-0.5">{kpi.hint}</p>}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/signals" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">前兆検知</Link>
          <Link to="/research-seeds" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">研究シードを登録</Link>
          <Link to="/input" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">テーマ/企業を登録</Link>
          <button onClick={refetchAll} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">再取得</button>
        </div>

        <ChartCard
          title="論文件数 × 株価 × クロス分析（テーマ別）"
          subtitle={`テーマ: ${reportQuery}${signalReport ? ` / ${signalReport.period.from_year}–${signalReport.period.to_year}年` : ''}`}
        >
          <div className="mb-3 flex items-center gap-2">
            <label htmlFor="theme-select" className="text-sm text-gray-600">テーマ</label>
            <select
              id="theme-select"
              value={reportQuery}
              onChange={e => setSelectedTheme(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {(data.trending_themes.length > 0 ? data.trending_themes.map(t => t.name) : [reportQuery]).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          {paperCounts.length > 0 ? (
            <UnifiedThemeCrossChart
              counts={paperCounts}
              stock={primaryStock?.stock}
              companyName={primaryStock?.name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <p>論文データがありません。</p>
              <Link to="/research-seeds" className="mt-2 text-sky-600 hover:underline">初期リサーチを実行する →</Link>
            </div>
          )}
        </ChartCard>
      </section>

      <h1 className="text-xl sm:text-2xl font-bold text-gray-800">ダッシュボード — 企業・株価</h1>

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
