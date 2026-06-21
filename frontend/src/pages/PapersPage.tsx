import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchSignalReport, fetchThemeCitations } from '../api'
import { useFilters } from '../contexts/useFilters'
import ChartCard from '../components/charts/ChartCard'
import ThemeCitationsList from '../components/ThemeCitationsList'
import PapersVsPriceComposed from '../components/charts/PapersVsPriceComposed'
import { useDashboardQuery, useTickerStocks } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

export default function PapersPage() {
  const { t } = useI18n()
  // テーマ選択はグローバルフィルタ(URL永続化)を参照する（SOT-997）。
  const { theme: selectedTheme, setTheme } = useFilters()
  const { data, isLoading, error } = useDashboardQuery()
  const { primaryStock } = useTickerStocks(data?.notable_companies ?? [])

  // テーマ選択（C1 の論文件数を切り替える）。未選択時は注目テーマの先頭。
  const reportQuery = selectedTheme || data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport, isLoading: isReportLoading, isFetching: isReportFetching } = useQuery({
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

  // テーマ別引用数リストのページネーション（SOT-995 /papers-5）。
  const [citationsPage, setCitationsPage] = useState(0)

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  // 急増テーマ（SOT-995 /papers-4）: 急増キーワードをテーマ別に集約し、伸び率の大きい順に上位表示する。
  const surgingByTheme = new Map<string, number>()
  for (const kw of data.top_keywords) {
    if (!kw.theme_name) continue
    surgingByTheme.set(kw.theme_name, Math.max(surgingByTheme.get(kw.theme_name) ?? -Infinity, kw.mom_change_pct))
  }
  const surgingThemes = [...surgingByTheme.entries()]
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  // ページネーション対象（テーマ別引用数）。
  const CITATIONS_PAGE_SIZE = 8
  const allCitationThemes = themeCitations?.themes ?? []
  const citationsPageCount = Math.max(1, Math.ceil(allCitationThemes.length / CITATIONS_PAGE_SIZE))
  const pageClamped = Math.min(citationsPage, citationsPageCount - 1)
  const pagedCitationThemes = allCitationThemes.slice(
    pageClamped * CITATIONS_PAGE_SIZE,
    pageClamped * CITATIONS_PAGE_SIZE + CITATIONS_PAGE_SIZE,
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('nav.papers')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('papers.subtitle')}</p>
      </div>

      {/* 急増テーマ ハイライト（SOT-995 /papers-4） */}
      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{t('papers.surging.title')}</h2>
          <p className="text-sm text-gray-500">{t('papers.surging.subtitle')}</p>
        </div>
        {surgingThemes.length === 0 ? (
          <p className="text-sm text-gray-400">{t('papers.surging.empty')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {surgingThemes.map(([name, pct]) => (
              <button
                key={name}
                type="button"
                onClick={() => setTheme(name)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                  name === reportQuery
                    ? 'border-amber-400 bg-amber-100 text-amber-800'
                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <span className="truncate max-w-[12rem]">{name}</span>
                <span className="font-semibold">+{pct.toFixed(0)}%</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{t('papers.citations.title')}</h2>
          <p className="text-sm text-gray-500">{t('papers.citations.subtitle')}</p>
        </div>
        <ThemeCitationsList themes={pagedCitationThemes} />
        {citationsPageCount > 1 && (
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setCitationsPage(p => Math.max(0, p - 1))}
              disabled={pageClamped === 0}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {t('common.prev')}
            </button>
            <span className="text-sm text-gray-500">{t('common.pageOf', { page: pageClamped + 1, total: citationsPageCount })}</span>
            <button
              type="button"
              onClick={() => setCitationsPage(p => Math.min(citationsPageCount - 1, p + 1))}
              disabled={pageClamped >= citationsPageCount - 1}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {t('common.next')}
            </button>
          </div>
        )}
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
              onChange={e => setTheme(e.target.value)}
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
          ) : (isReportLoading || isReportFetching) && !signalReport ? (
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
      </section>
    </div>
  )
}
