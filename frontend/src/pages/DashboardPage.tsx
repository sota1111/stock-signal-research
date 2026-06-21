import type { ReactNode } from 'react'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchSignalReport, fetchThemeCitations, fetchThemeCitationMatrix } from '../api'
import ChartCard from '../components/charts/ChartCard'
import PapersCountChart from '../components/charts/PapersCountChart'
import TopMarketCapChart from '../components/charts/TopMarketCapChart'
import PapersMarketCapCrossChart from '../components/charts/PapersMarketCapCrossChart'
import ThemeCitationMatrix from '../components/ThemeCitationMatrix'
import { useDashboardQuery, useTickerStocks, buildTopMarketCapYearly, buildTopMarketCapCompanyYearly } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

export default function DashboardPage() {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const [selectedTheme, setSelectedTheme] = useState<string>('')
  const { data, isLoading, error } = useDashboardQuery()
  const { tickerCompanies, stockQueries, stockItems } = useTickerStocks(data?.notable_companies ?? [])

  // テーマ選択（選択でグラフが切り替わる）。未選択時は注目テーマの先頭。
  const reportQuery = selectedTheme || data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport, isLoading: isReportLoading, isFetching: isReportFetching } = useQuery({
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

  // テーマ×年 引用数マトリクス（行=テーマ / 列=直近10年 / セル=引用数合計, SOT-944）
  const { data: citationMatrix } = useQuery({
    queryKey: ['theme-citation-matrix'],
    queryFn: () => fetchThemeCitationMatrix(10),
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
    queryClient.invalidateQueries({ queryKey: ['theme-citation-matrix'] })
  }

  const trendingCount = data.trending_themes.length
  const companyCount = data.notable_companies.length
  const topKeyword = data.top_keywords[0]
  const paperCounts = signalReport?.paper_counts_by_year ?? []
  // データ取得中（初期表示・テーマ切替時）は空表示ではなくローディングを出す
  const isPapersLoading = (isReportLoading || isReportFetching) && !signalReport
  const TOP_N = 10
  const marketCapYearly = buildTopMarketCapYearly(stockItems, TOP_N)
  const marketCapByCompany = buildTopMarketCapCompanyYearly(stockItems, TOP_N)
  const totalCitations = themeCitations?.total_citations ?? null
  const lastAnalyzed = signalReport?.generated_at ? new Date(signalReport.generated_at).toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP') : '—'

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
      border: 'border-emerald-500', dot: 'bg-emerald-500', label: t('status.ok.label'),
      message: t('status.ok.message'),
      action: <Link to="/signals" className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">{t('status.ok.action')}</Link>,
    },
    warning: {
      border: 'border-amber-500', dot: 'bg-amber-500', label: t('status.warning.label'),
      message: t('status.warning.message'),
      action: <button onClick={refetchAll} className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700">{t('status.warning.action')}</button>,
    },
    empty: {
      border: 'border-gray-400', dot: 'bg-gray-400', label: t('status.empty.label'),
      message: t('status.empty.message'),
      action: <Link to="/research-seeds" className="inline-flex items-center rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">{t('status.empty.action')}</Link>,
    },
  }
  const status = statusConfig[statusKey]

  const kpis: { label: string; value: string; hint?: string }[] = [
    { label: t('kpi.trendingThemes'), value: trendingCount > 0 ? `${trendingCount}` : '—', hint: t('kpi.trendingThemes.hint') },
    { label: t('kpi.notableCompanies'), value: companyCount > 0 ? `${companyCount}` : '—', hint: t('kpi.notableCompanies.hint') },
    { label: t('kpi.surgingKeyword'), value: topKeyword?.keyword ?? '—', hint: topKeyword ? `${topKeyword.mom_change_pct >= 0 ? '+' : ''}${topKeyword.mom_change_pct.toFixed(0)}% MoM` : undefined },
    { label: t('kpi.totalCitations'), value: totalCitations != null ? totalCitations.toLocaleString() : '—', hint: t('kpi.totalCitations.hint') },
    ...(tickerTotal > 0 ? [{ label: t('kpi.stockSuccessRate'), value: successRate != null ? `${successRate}%` : '…', hint: `${stockSuccess}/${tickerTotal}` }] : []),
  ]

  return (
    <div className="space-y-8">
      {/* === サマリ帯：状態・次アクション・重要指標 === */}
      <section className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('dashboard.subtitle')}</p>
          <p className="text-xs text-gray-400 mt-1">{t('dashboard.lastAnalyzed')}: {lastAnalyzed}</p>
        </div>

        <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${status.border}`}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-semibold text-gray-800">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${status.dot}`} aria-hidden />
                {t('status.label')}: {status.label}
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
          <Link to="/stock" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.viewStock')}</Link>
          <Link to="/papers" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.viewPapers')}</Link>
          <Link to="/investors" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.viewInvestors')}</Link>
          <Link to="/signals" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.signals')}</Link>
          <Link to="/research-seeds" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.registerSeed')}</Link>
          <Link to="/input" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.registerTheme')}</Link>
          <button onClick={refetchAll} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.refetch')}</button>
        </div>

        {/* テーマ選択（論文・クロス分析グラフに反映） */}
        <div className="flex items-center gap-2 min-w-0">
          <label htmlFor="theme-select" className="shrink-0 text-sm text-gray-600">{t('dashboard.themeLabel')}</label>
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

        {/* グラフ③ クロス分析（論文 × 時価総額） */}
        <ChartCard
          title={t('chart.cross.title')}
          subtitle={`${t('dashboard.themeLabel')}: ${reportQuery}`}
        >
          <PapersMarketCapCrossChart counts={paperCounts} marketCap={marketCapYearly} />
        </ChartCard>

        {/* グラフ① 論文件数 */}
        <ChartCard
          title={t('chart.papers.title')}
          subtitle={`${t('dashboard.themeLabel')}: ${reportQuery}${signalReport ? ` / ${signalReport.period.from_year}–${signalReport.period.to_year}` : ''}`}
        >
          {paperCounts.length > 0 ? (
            <PapersCountChart counts={paperCounts} />
          ) : isPapersLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
              <p>{t('chart.papers.loading')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <p>{t('chart.papers.empty')}</p>
              <Link to="/research-seeds" className="mt-2 text-sky-600 hover:underline">{t('chart.papers.emptyCta')}</Link>
            </div>
          )}
        </ChartCard>

        {/* グラフ② 上位10社時価総額合計 */}
        <ChartCard
          title={t('chart.topMarketCap.title', { n: TOP_N })}
          subtitle={t('chart.topMarketCap.subtitle')}
        >
          <TopMarketCapChart data={marketCapByCompany.data} series={marketCapByCompany.series} />
        </ChartCard>

        {/* マトリクス テーマ別 引用数（テーマ × 年） */}
        <ChartCard
          title={t('chart.citationMatrix.title')}
          subtitle={t('chart.citationMatrix.subtitle')}
        >
          {citationMatrix ? (
            <ThemeCitationMatrix data={citationMatrix} />
          ) : (
            <p className="text-sm text-gray-400">{t('chart.citationMatrix.loading')}</p>
          )}
        </ChartCard>
      </section>

      <p className="text-xs text-gray-400 border-t pt-4">
        {t('dashboard.disclaimer')}
      </p>
    </div>
  )
}
