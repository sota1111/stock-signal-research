import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchThemes, fetchPatents, fetchPatentYearly, fetchPatentTopAssignees } from '../api'
import { useFilters } from '../contexts/useFilters'
import ChartCard, { EmptyChart } from '../components/charts/ChartCard'
import PatentCountsByYearBar from '../components/charts/PatentCountsByYearBar'
import { PageLoading, PageEmpty } from '../components/AsyncState'
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

  const themeName = useMemo(() => {
    const map = new Map(themes.map(th => [th.id, th.name]))
    return (id?: string) => (id ? map.get(id) ?? '' : '')
  }, [themes])

  // 年次トレンド: theme_id×year の件数を、選択テーマ(未選択なら全テーマ)で年ごとに合算する。
  const yearlyChart = useMemo(() => {
    const byYear = new Map<string, number>()
    for (const row of yearly) {
      if (selectedTheme && row.theme_id !== selectedTheme) continue
      byYear.set(row.year, (byYear.get(row.year) ?? 0) + (row.count || 0))
    }
    return [...byYear.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year.localeCompare(b.year))
  }, [yearly, selectedTheme])

  // 特許データのあるテーマだけをセレクトの選択肢にする。
  const themesWithData = useMemo(() => {
    const ids = new Set(yearly.map(r => r.theme_id))
    return themes.filter(th => ids.has(th.id))
  }, [themes, yearly])

  const maxAssignee = topAssignees.reduce((m, a) => Math.max(m, a.count), 0)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('patents.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('patents.subtitle')}</p>
      </div>

      {/* テーマ選択 */}
      <div className="flex items-center gap-2 min-w-0">
        <label htmlFor="patents-theme-select" className="shrink-0 text-sm text-gray-600">
          {t('patents.themeLabel')}
        </label>
        <select
          id="patents-theme-select"
          value={selectedTheme}
          onChange={e => setThemeId(e.target.value)}
          className="min-w-0 max-w-full flex-1 truncate rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400 sm:flex-none"
        >
          <option value="">{t('patents.allThemes')}</option>
          {themesWithData.map(th => (
            <option key={th.id} value={th.id}>{th.name}</option>
          ))}
        </select>
      </div>

      {/* 年次トレンド */}
      <section className="space-y-3">
        <ChartCard title={t('patents.trend.title')} subtitle={t('patents.trend.subtitle')}>
          <PatentCountsByYearBar data={yearlyChart} />
        </ChartCard>
      </section>

      {/* 主要出願人 */}
      <section className="space-y-3">
        <ChartCard title={t('patents.assignees.title')} subtitle={t('patents.assignees.subtitle')}>
          {topAssignees.length === 0 ? (
            <EmptyChart message={t('patents.assignees.empty')} />
          ) : (
            <ul className="space-y-2">
              {topAssignees.map(a => (
                <li key={a.assignee} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-gray-700" title={a.assignee}>{a.assignee}</span>
                  <span className="flex-1 min-w-0">
                    <span
                      className="block h-3 rounded bg-violet-400"
                      style={{ width: maxAssignee > 0 ? `${Math.max(6, (a.count / maxAssignee) * 100)}%` : '6%' }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-xs text-gray-500">{a.count}</span>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </section>

      {/* 特許リスト */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{t('patents.list.title')}</h2>
          <p className="text-sm text-gray-500">{t('patents.list.subtitle')}</p>
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
                className="block bg-white rounded-lg border border-slate-200 p-3 hover:border-sky-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-medium text-sm text-gray-800">{p.title}</p>
                  <span className="shrink-0 text-xs text-gray-400">{p.published_at}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  {p.patent_number && <span className="text-sky-600">US{p.patent_number}</span>}
                  {p.assignee && <span className="truncate max-w-[60%]">{p.assignee}</span>}
                  {p.theme_id && <span className="text-gray-400">{themeName(p.theme_id)}</span>}
                  {p.cpc && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">{p.cpc}</span>}
                </div>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* 外部検索(補助導線) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{t('patents.themeSearch.title')}</h2>
          <p className="text-sm text-gray-500">{t('patents.themeSearch.subtitle')}</p>
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
