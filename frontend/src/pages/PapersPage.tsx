import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchThemes, fetchPapers } from '../api'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'
import type { Theme } from '../types'

const PAGE_SIZE = 20

export default function PapersPage() {
  const { t } = useI18n()
  // カテゴリ / テーマでの絞り込み（このページ内ローカル状態）。空文字 = 全件。
  const [category, setCategory] = useState('')
  const [themeId, setThemeId] = useState('')
  const [page, setPage] = useState(0)

  const { data: themes, isLoading: themesLoading, error: themesError } = useQuery({
    queryKey: ['themes'],
    queryFn: fetchThemes,
    staleTime: 1000 * 60 * 30,
  })

  // テーマ指定時はバックエンドで絞り込み、未指定時は全論文を取得してカテゴリで client 絞り込み。
  const { data: papers, isLoading: papersLoading } = useQuery({
    queryKey: ['papers', themeId || ''],
    queryFn: () => fetchPapers(themeId || undefined),
    staleTime: 1000 * 60 * 30,
  })

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const th of themes ?? []) if (th.category) set.add(th.category)
    return [...set].sort()
  }, [themes])

  const themesInCategory = useMemo<Theme[]>(() => {
    const list = themes ?? []
    return category ? list.filter(th => th.category === category) : list
  }, [themes, category])

  const themeById = useMemo(() => {
    const m = new Map<string, Theme>()
    for (const th of themes ?? []) m.set(th.id, th)
    return m
  }, [themes])

  const filteredPapers = useMemo(() => {
    let list = papers ?? []
    // テーマ未指定 + カテゴリ指定時は、そのカテゴリに属するテーマの論文のみ。
    if (!themeId && category) {
      const allowed = new Set(themesInCategory.map(th => th.id))
      list = list.filter(p => p.theme_id && allowed.has(p.theme_id))
    }
    return [...list].sort((a, b) => (b.citation_count ?? 0) - (a.citation_count ?? 0))
  }, [papers, themeId, category, themesInCategory])

  if (themesLoading) return <DashboardLoading />
  if (themesError || !themes) return <DashboardError />

  const pageCount = Math.max(1, Math.ceil(filteredPapers.length / PAGE_SIZE))
  const pageClamped = Math.min(page, pageCount - 1)
  const pageItems = filteredPapers.slice(pageClamped * PAGE_SIZE, pageClamped * PAGE_SIZE + PAGE_SIZE)

  const onCategoryChange = (value: string) => {
    setCategory(value)
    setThemeId('') // カテゴリを変えたらテーマ選択はリセット
    setPage(0)
  }
  const onThemeChange = (value: string) => {
    setThemeId(value)
    setPage(0)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('nav.papers')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('papers.subtitle')}</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('papers.list.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('papers.list.subtitle')}</p>
        </div>

        {/* 絞り込み: カテゴリ / テーマ */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <label htmlFor="papers-category-select" className="shrink-0 text-sm text-muted-foreground">{t('dashboard.categoryLabel')}</label>
            <select
              id="papers-category-select"
              value={category}
              onChange={e => onCategoryChange(e.target.value)}
              className="min-w-0 max-w-full truncate rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="">{t('dashboard.allCategories')}</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <label htmlFor="papers-theme-select" className="shrink-0 text-sm text-muted-foreground">{t('dashboard.themeLabel')}</label>
            <select
              id="papers-theme-select"
              value={themeId}
              onChange={e => onThemeChange(e.target.value)}
              className="min-w-0 max-w-full truncate rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="">{t('papers.allThemes')}</option>
              {themesInCategory.map(th => (
                <option key={th.id} value={th.id}>{th.name}</option>
              ))}
            </select>
          </div>
        </div>

        {papersLoading ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
            <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
            <p>{t('chart.papers.loading')}</p>
          </div>
        ) : filteredPapers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('papers.list.empty')}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('papers.list.count', { count: filteredPapers.length })}</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-muted text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{t('list.col.title')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('list.col.themeName')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('list.col.source')}</th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{t('list.col.publishedAt')}</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">{t('list.col.citations')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageItems.map(p => {
                    const theme = p.theme_id ? themeById.get(p.theme_id) : undefined
                    return (
                      <tr key={p.id} className="bg-surface hover:bg-surface-muted">
                        <td className="px-3 py-2 text-foreground">
                          {p.url ? (
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">{p.title}</a>
                          ) : (
                            p.title
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{theme?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{p.source}</td>
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{p.published_at?.slice(0, 10) ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-foreground whitespace-nowrap">{(p.citation_count ?? 0).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={pageClamped === 0}
                  className="rounded-md border border-gray-300 bg-surface px-3 py-1 text-sm text-foreground hover:bg-surface-muted disabled:opacity-40"
                >
                  {t('common.prev')}
                </button>
                <span className="text-sm text-muted-foreground">{t('common.pageOf', { page: pageClamped + 1, total: pageCount })}</span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                  disabled={pageClamped >= pageCount - 1}
                  className="rounded-md border border-gray-300 bg-surface px-3 py-1 text-sm text-foreground hover:bg-surface-muted disabled:opacity-40"
                >
                  {t('common.next')}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
