import type { ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchSignalReport, fetchThemeCitations } from '../api'
import { useDashboardQuery, useTickerStocks, GRAPH_FROM_YEAR } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

// 論文取得の下限年（SOT-1069: 他ページと同じ 2009 起点に統一）。lastAnalyzed の generated_at 取得用。
// グラフ表示は無いが、signal-report の queryKey を Dashboard/Signals と揃えてキャッシュを共有する。
const PAPER_HISTORY_FROM_YEAR = GRAPH_FROM_YEAR

// SOT-991: ダッシュボードにあった「状態表示」（状態バナー + 重要指標KPI）を独立ページへ移行。
export default function StatusPage() {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useDashboardQuery()
  const { tickerCompanies, stockQueries } = useTickerStocks(data?.notable_companies ?? [])

  const reportQuery = data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', reportQuery, PAPER_HISTORY_FROM_YEAR],
    queryFn: () => fetchSignalReport(reportQuery, PAPER_HISTORY_FROM_YEAR),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  // テーマ別 引用数（上位100論文の総引用数）
  const { data: themeCitations } = useQuery({
    queryKey: ['theme-citations'],
    queryFn: () => fetchThemeCitations(100),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

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
      <section className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('status.page.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('status.page.subtitle')}</p>
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
      </section>
    </div>
  )
}
