import type { ReactNode } from 'react'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchSignalReport, fetchThemeCitations } from '../api'
import ChartCard from '../components/charts/ChartCard'
import UnifiedThemeCrossChart from '../components/charts/UnifiedThemeCrossChart'
import { useDashboardQuery, useTickerStocks } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'

export default function DashboardPage() {
  const queryClient = useQueryClient()
  const [selectedTheme, setSelectedTheme] = useState<string>('')
  const { data, isLoading, error } = useDashboardQuery()
  const { tickerCompanies, stockQueries, primaryStock } = useTickerStocks(data?.notable_companies ?? [])

  // テーマ選択（選択でグラフが切り替わる）。未選択時は注目テーマの先頭。
  const reportQuery = selectedTheme || data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', reportQuery],
    queryFn: () => fetchSignalReport(reportQuery),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  // テーマ別 引用数（上位100論文の総引用数）。主指標を「論文件数」から「引用数」へ。
  const { data: themeCitations } = useQuery({
    queryKey: ['theme-citations'],
    queryFn: () => fetchThemeCitations(100),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  // === サマリ帯（状態・次アクション・重要指標）用の集計 ===
  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['signal-report'] })
    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['backtest'] })
    queryClient.invalidateQueries({ queryKey: ['theme-citations'] })
  }

  const trendingCount = data.trending_themes.length
  const companyCount = data.notable_companies.length
  const topKeyword = data.top_keywords[0]
  const paperCounts = signalReport?.paper_counts_by_year ?? []
  const totalCitations = themeCitations?.total_citations ?? null
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
    { label: '総引用数（上位100論文）', value: totalCitations != null ? totalCitations.toLocaleString() : '—', hint: 'テーマ別上位100の合計' },
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

        {/* 各機能ページへのナビゲーション */}
        <div className="flex flex-wrap gap-2">
          <Link to="/stock" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">株価を見る</Link>
          <Link to="/papers" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">論文を見る</Link>
          <Link to="/investors" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">投資家向けを見る</Link>
          <Link to="/signals" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">前兆検知</Link>
          <Link to="/research-seeds" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">研究シードを登録</Link>
          <Link to="/input" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">テーマ/企業を登録</Link>
          <button onClick={refetchAll} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">再取得</button>
        </div>

        <ChartCard
          title="論文件数 × 株価 × クロス分析（テーマ別）"
          subtitle={`テーマ: ${reportQuery}${signalReport ? ` / ${signalReport.period.from_year}–${signalReport.period.to_year}年` : ''}`}
        >
          <div className="mb-3 flex items-center gap-2 min-w-0">
            <label htmlFor="theme-select" className="shrink-0 text-sm text-gray-600">テーマ</label>
            <select
              id="theme-select"
              value={reportQuery}
              onChange={e => setSelectedTheme(e.target.value)}
              className="min-w-0 max-w-full flex-1 truncate rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400 sm:flex-none"
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

      <p className="text-xs text-gray-400 border-t pt-4">
        ※ このツールは情報収集・分析支援を目的としています。投資判断は自己責任でお願いします。
      </p>
    </div>
  )
}
