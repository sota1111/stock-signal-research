import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchThemes, fetchPatents, fetchPatentYearly, fetchPatentTopAssignees, fetchSignalReport } from '../api'
import { useFilters } from '../contexts/useFilters'
import ChartCard, { EmptyChart } from '../components/charts/ChartCard'
import PatentCountsByYearBar from '../components/charts/PatentCountsByYearBar'
import PatentsVsPapersComposed from '../components/charts/PatentsVsPapersComposed'
import { PageLoading, PageEmpty } from '../components/AsyncState'
import { GRAPH_FROM_YEAR } from './dashboardData'
import { useI18n } from '../i18n/useI18n'

const J_PLATPAT_URL = 'https://www.j-platpat.inpit.go.jp/'

function googlePatentsUrl(query: string) {
  return `https://patents.google.com/?q=${encodeURIComponent(query)}`
}

export default function PatentsPage() {
  const { t } = useI18n()
  // テーマ選択(theme_id)はグローバルフィルタ(URL永続化)を参照する（SOT-997）。'' = 全テーマ
  const { themeId: selectedTheme, setThemeId } = useFilters()

  const themeArg = selectedTheme || undefined
  const { data: themes = [] } = useQuery({ queryKey: ['themes'], queryFn: fetchThemes })
  const { data: patents = [], isLoading } = useQuery({
    queryKey: ['patents', selectedTheme],
    queryFn: () => fetchPatents(themeArg),
    staleTime: 1000 * 60 * 30,
  })
  const { data: yearly = [] } = useQuery({
    queryKey: ['patent-yearly'],
    queryFn: () => fetchPatentYearly(),
    staleTime: 1000 * 60 * 30,
  })
  const { data: topAssignees = [] } = useQuery({
    queryKey: ['patent-top-assignees', selectedTheme],
    queryFn: () => fetchPatentTopAssignees(themeArg, 10),
    staleTime: 1000 * 60 * 30,
  })

  // 特許×論文 重ね合わせ用に、選択テーマ名から論文の年次件数を取得する（SOT-995 /patents-1）。
  const selectedThemeName = themes.find(th => th.id === selectedTheme)?.name ?? ''
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', selectedThemeName, GRAPH_FROM_YEAR],
    queryFn: () => fetchSignalReport(selectedThemeName, GRAPH_FROM_YEAR),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!selectedThemeName,
  })

  const themeName = useMemo(() => {
    const map = new Map(themes.map(th => [th.id, th.name]))
    return (id?: string) => (id ? map.get(id) ?? '' : '')
  }, [themes])

  // 年次トレンド: theme_id×year の件数を、選択テーマ(未選択なら全テーマ)で年ごとに合算する。
  const yearlyChart = useMemo(() => {
    const byYear = new Map<string, number>()
    for (const row of yearly) {
      if (selectedTheme && row.theme_id !== selectedTheme) continue
      // SOT-1069: 特許の年次トレンドも 2009 起点に揃える（2000–2008 を除外）。
      if (Number(row.year) < GRAPH_FROM_YEAR) continue
      byYear.set(row.year, (byYear.get(row.year) ?? 0) + (row.count || 0))
    }
    return [...byYear.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year.localeCompare(b.year))
  }, [yearly, selectedTheme])

  // SOT-1119: 100テーマ全てをセレクトに出し、テーマごとの収集状態を区別表示する。
  //   data        : 年次件数があり合計 > 0(実データあり)
  //   nomatch     : 収集済みだが全年 0 件(該当特許なし)
  //   uncollected : 年次行が無い(まだ収集していない)
  const { collectedIds, dataIds } = useMemo(() => {
    const collected = new Set<string>()
    const sums = new Map<string, number>()
    for (const r of yearly) {
      collected.add(r.theme_id)
      sums.set(r.theme_id, (sums.get(r.theme_id) ?? 0) + (r.count || 0))
    }
    const data = new Set<string>()
    for (const [id, s] of sums) if (s > 0) data.add(id)
    return { collectedIds: collected, dataIds: data }
  }, [yearly])

  const themeStatus = useMemo(
    () => (id: string): 'data' | 'nomatch' | 'uncollected' =>
      dataIds.has(id) ? 'data' : collectedIds.has(id) ? 'nomatch' : 'uncollected',
    [dataIds, collectedIds],
  )

  // 実データのあるテーマを先頭に、未収集を末尾に並べる(選びやすさ優先・安定ソート)。
  const sortedThemes = useMemo(() => {
    const rank = { data: 0, nomatch: 1, uncollected: 2 } as const
    return themes
      .map((th, i) => ({ th, i }))
      .sort((a, b) => rank[themeStatus(a.th.id)] - rank[themeStatus(b.th.id)] || a.i - b.i)
      .map(x => x.th)
  }, [themes, themeStatus])

  const maxAssignee = topAssignees.reduce((m, a) => Math.max(m, a.count), 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('patents.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('patents.subtitle')}</p>
      </div>

      {/* テーマ選択 */}
      <div className="flex items-center gap-2 min-w-0">
        <label htmlFor="patents-theme-select" className="shrink-0 text-sm text-muted-foreground">
          {t('patents.themeLabel')}
        </label>
        <select
          id="patents-theme-select"
          value={selectedTheme}
          onChange={e => setThemeId(e.target.value)}
          className="min-w-0 max-w-full flex-1 truncate rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400 sm:flex-none"
        >
          <option value="">{t('patents.allThemes')}</option>
          {sortedThemes.map(th => {
            const status = themeStatus(th.id)
            const suffix =
              status === 'nomatch' ? ` ${t('patents.status.nomatch')}`
              : status === 'uncollected' ? ` ${t('patents.status.uncollected')}`
              : ''
            return (
              <option key={th.id} value={th.id}>{th.name}{suffix}</option>
            )
          })}
        </select>
      </div>

      {/* 収集状態の凡例（SOT-1119: 100テーマ化に伴い 未収集/該当なし を区別） */}
      <p className="-mt-4 text-xs text-muted-foreground">{t('patents.status.legend')}</p>

      {/* テーマ未選択時の空状態ガイド（SOT-995 /patents-5） */}
      {!selectedTheme && (
        <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {t('patents.selectThemeGuide')}
        </div>
      )}

      {/* 年次トレンド */}
      <section className="space-y-3">
        <ChartCard title={t('patents.trend.title')} subtitle={t('patents.trend.subtitle')}>
          <PatentCountsByYearBar data={yearlyChart} />
        </ChartCard>
      </section>

      {/* 特許 × 論文 トレンド重ね合わせ（SOT-995 /patents-1） */}
      {selectedTheme && (
        <section className="space-y-3">
          <ChartCard title={t('patents.overlay.title')} subtitle={t('patents.overlay.subtitle')}>
            <PatentsVsPapersComposed patents={yearlyChart} papers={signalReport?.paper_counts_by_year ?? []} />
          </ChartCard>
        </section>
      )}

      {/* 主要出願人 */}
      <section className="space-y-3">
        <ChartCard title={t('patents.assignees.title')} subtitle={t('patents.assignees.subtitle')}>
          {topAssignees.length === 0 ? (
            <EmptyChart message={t('patents.assignees.empty')} />
          ) : (
            <ul className="space-y-2">
              {topAssignees.map(a => (
                <li key={a.assignee} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-foreground" title={a.assignee}>{a.assignee}</span>
                  <span className="flex-1 min-w-0">
                    <span
                      className="block h-3 rounded bg-violet-400"
                      style={{ width: maxAssignee > 0 ? `${Math.max(6, (a.count / maxAssignee) * 100)}%` : '6%' }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">{a.count}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </section>

      {/* 特許リスト */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('patents.list.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('patents.list.subtitle')}</p>
        </div>
        {isLoading ? (
          <PageLoading message={t('patents.loading')} />
        ) : patents.length === 0 ? (
          <PageEmpty message={t('patents.list.empty')} />
        ) : (
          <div className="space-y-2">
            {patents.slice(0, 60).map(p => (
              <a
                key={p.patent_id}
                href={p.url || googlePatentsUrl(p.patent_number || p.title)}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-surface rounded-lg border border-border p-3 hover:border-sky-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-sm text-foreground">{p.title}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.published_at}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {p.patent_number && <span className="text-sky-600">US{p.patent_number}</span>}
                  {p.assignee && <span className="truncate max-w-[60%]">{p.assignee}</span>}
                  {p.theme_id && <span className="text-muted-foreground">{themeName(p.theme_id)}</span>}
                  {p.cpc && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-muted-foreground">{p.cpc}</span>}
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* 外部検索(補助導線) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('patents.themeSearch.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('patents.themeSearch.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a href={googlePatentsUrl(themeName(selectedTheme) || 'AI semiconductor')} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">
            Google Patents →
          </a>
          <a href={J_PLATPAT_URL} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">
            J-PlatPat →
          </a>
        </div>
      </section>
    </div>
  )
}
