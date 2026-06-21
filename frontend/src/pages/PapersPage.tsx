import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchSignalReport, fetchThemeCitations } from '../api'
import ChartCard from '../components/charts/ChartCard'
import ThemeCitationsList from '../components/ThemeCitationsList'
import PapersVsPriceComposed from '../components/charts/PapersVsPriceComposed'
import { useDashboardQuery, useTickerStocks } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

export default function PapersPage() {
  const { t } = useI18n()
  const [selectedTheme, setSelectedTheme] = useState<string>('')
  const { data, isLoading, error } = useDashboardQuery()
  const { primaryStock } = useTickerStocks(data?.notable_companies ?? [])

  // テーマ選択（C1 の論文件数を切り替える）。未選択時は注目テーマの先頭。
  const reportQuery = selectedTheme || data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', reportQuery],
    queryFn: () => fetchSignalReport(reportQuery),
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('nav.papers')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('papers.subtitle')}</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{t('papers.citations.title')}</h2>
          <p className="text-sm text-gray-500">{t('papers.citations.subtitle')}</p>
        </div>
        <ThemeCitationsList themes={themeCitations?.themes ?? []} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">{t('papers.cross.title')}</h2>
        <ChartCard
          title={t('papers.c1.title')}
          subtitle={`${t('papers.c1.subtitle')}${primaryStock ? ` / ${primaryStock.name}` : ''}`}
        >
          <div className="mb-3 flex items-center gap-2 min-w-0">
            <label htmlFor="papers-theme-select" className="shrink-0 text-sm text-gray-600">{t('dashboard.themeLabel')}</label>
            <select
              id="papers-theme-select"
              value={reportQuery}
              onChange={e => setSelectedTheme(e.target.value)}
              className="min-w-0 max-w-full flex-1 truncate rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400 sm:flex-none"
            >
              {(data.trending_themes.length > 0 ? data.trending_themes.map(t => t.name) : [reportQuery]).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          {(signalReport?.paper_counts_by_year ?? []).length > 0 ? (
            <PapersVsPriceComposed
              counts={signalReport?.paper_counts_by_year ?? []}
              stock={primaryStock?.stock}
              companyName={primaryStock?.name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <p>{t('chart.papers.empty')}</p>
              <Link to="/research-seeds" className="mt-2 text-sky-600 hover:underline">{t('chart.papers.emptyCta')}</Link>
            </div>
          )}
        </ChartCard>
      </section>
    </div>
  )
}
