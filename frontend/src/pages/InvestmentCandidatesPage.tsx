import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchThemes, fetchPatentYearly, fetchInvestors, fetchMonthlyData } from '../api'
import ChartCard from '../components/charts/ChartCard'
import LeadLagCorrelationBar from '../components/charts/LeadLagCorrelationBar'
import LeadLagSeriesChart from '../components/charts/LeadLagSeriesChart'
import { useDashboardQuery, useTickerStocks } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import {
  aggregatePaperMonthly,
  buildMarketMonthlyIndex,
  buildLeadLagSeries,
  computeLeadLag,
} from './leadLagData'
import { buildCompositeRanking, COMPOSITE_WEIGHTS } from './compositeScore'
import { useI18n } from '../i18n/useI18n'

const STALE = 1000 * 60 * 30

export default function InvestmentCandidatesPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useDashboardQuery()
  const companies = useMemo(() => data?.notable_companies ?? [], [data])

  const [themeId, setThemeId] = useState('')

  const { data: themes } = useQuery({ queryKey: ['themes'], queryFn: fetchThemes, staleTime: STALE })
  const { data: patentYearly } = useQuery({ queryKey: ['patent-yearly-all'], queryFn: () => fetchPatentYearly(), staleTime: STALE })
  const { data: investors } = useQuery({ queryKey: ['investors'], queryFn: fetchInvestors, staleTime: STALE })

  // リードラグ: 注目企業の株価から合成マーケット指数を組み立てる。
  const { stockItems } = useTickerStocks(companies)
  const stockMonthly = useMemo(() => buildMarketMonthlyIndex(stockItems), [stockItems])

  // 対象テーマ（既定はトレンド先頭）。
  const themeOptions = data?.trending_themes ?? []
  const effThemeId = themeId || themeOptions[0]?.id || ''
  const { data: monthly } = useQuery({
    queryKey: ['papers-monthly', effThemeId],
    queryFn: () => fetchMonthlyData(effThemeId || undefined),
    staleTime: STALE,
    enabled: !!data,
  })
  const paperMonthly = useMemo(() => aggregatePaperMonthly(monthly ?? []), [monthly])

  const { results, bestLag } = useMemo(
    () => computeLeadLag(paperMonthly, stockMonthly),
    [paperMonthly, stockMonthly],
  )
  const series = useMemo(
    () => buildLeadLagSeries(paperMonthly, stockMonthly),
    [paperMonthly, stockMonthly],
  )

  const ranking = useMemo(
    () => buildCompositeRanking(companies, themes ?? [], patentYearly ?? [], investors ?? []),
    [companies, themes, patentYearly, investors],
  )

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('candidates.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('candidates.subtitle')}</p>
      </div>

      {/* 提案3: リードラグ分析 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t('candidates.leadlag.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('candidates.leadlag.subtitle')}</p>
          </div>
          {themeOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="leadlag-theme" className="shrink-0 text-sm text-muted-foreground">{t('candidates.leadlag.selectTheme')}</label>
              <select
                id="leadlag-theme"
                value={effThemeId}
                onChange={e => setThemeId(e.target.value)}
                className="rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                {themeOptions.map(th => <option key={th.id} value={th.id}>{th.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="rounded-md bg-sky-50 border border-sky-100 px-4 py-3 text-sm text-sky-800">
          {bestLag != null
            ? t('candidates.leadlag.best', { n: bestLag })
            : t('candidates.leadlag.noData')}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={t('candidates.leadlag.corrTitle')} subtitle={t('candidates.leadlag.corrSubtitle')}>
            <LeadLagCorrelationBar results={results} />
          </ChartCard>
          <ChartCard title={t('candidates.leadlag.seriesTitle')} subtitle={t('candidates.leadlag.seriesSubtitle')}>
            <LeadLagSeriesChart data={series} />
          </ChartCard>
        </div>
      </section>

      {/* 提案4: 複合スコア投資候補ランキング */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('candidates.ranking.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('candidates.ranking.subtitle', {
              paper: Math.round(COMPOSITE_WEIGHTS.paper * 100),
              patent: Math.round(COMPOSITE_WEIGHTS.patent * 100),
              investor: Math.round(COMPOSITE_WEIGHTS.investor * 100),
            })}
          </p>
        </div>
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('candidates.ranking.empty')}</p>
        ) : (
          <div className="bg-surface rounded-lg shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-right">#</th>
                  <th className="px-4 py-2 text-left">{t('candidates.ranking.col.company')}</th>
                  <th className="px-4 py-2 text-right">{t('candidates.ranking.col.composite')}</th>
                  <th className="px-4 py-2 text-right">{t('candidates.ranking.col.paper')}</th>
                  <th className="px-4 py-2 text-right">{t('candidates.ranking.col.patent')}</th>
                  <th className="px-4 py-2 text-right">{t('candidates.ranking.col.investor')}</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(row => (
                  <tr key={row.company.id} className="border-t hover:bg-surface-muted">
                    <td className="px-4 py-2 text-right text-muted-foreground" data-label="#">{row.rank}</td>
                    <td className="px-4 py-2" data-label={t('candidates.ranking.col.company')}>
                      <span className="font-medium text-foreground">{row.company.name}</span>
                      {row.company.ticker && <span className="ml-2 text-xs text-muted-foreground">{row.company.ticker}</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-foreground" data-label={t('candidates.ranking.col.composite')}>
                      {row.composite.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground" data-label={t('candidates.ranking.col.paper')}>{row.paper.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground" data-label={t('candidates.ranking.col.patent')}>{row.patent.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground" data-label={t('candidates.ranking.col.investor')}>{row.investor.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
