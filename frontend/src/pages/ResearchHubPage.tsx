import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchThemes, fetchDashboard } from '../api'
import { PageLoading } from '../components/AsyncState'
import { useI18n } from '../i18n/useI18n'
import type { MessageKey } from '../i18n/messages'
import PapersPage from './PapersPage'
import PatentsPage from './PatentsPage'

// テーマ・論文・特許を1つの統一ページにまとめる（SOT-1145）。
// 3画面をタブ切替で集約し、各タブの読み込み中はローディング表示を出す。
const TABS = ['themes', 'papers', 'patents'] as const
type Tab = typeof TABS[number]
const TAB_LABEL_KEY: Record<Tab, MessageKey> = {
  themes: 'research.tab.themes',
  papers: 'research.tab.papers',
  patents: 'research.tab.patents',
}

// テーマ一覧タブ。ListPage のテーマ表示を踏襲しつつ、
// 読み込み中は PageLoading を出す（SOT-1145: 統一ページでもローディング表示）。
function ThemesTab() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'precursor_score' | 'alignment_score'>('precursor_score')

  const { data: themes, isLoading } = useQuery({ queryKey: ['themes'], queryFn: fetchThemes })
  const { data: dashboard } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })

  if (isLoading) return <PageLoading />

  const alignmentMap = new Map<string, { score: number; confidence: number }>()
  dashboard?.alignment_highlights?.high_alignment?.forEach(item => {
    alignmentMap.set(item.theme.id, { score: item.score, confidence: item.confidence })
  })

  const q = search.trim().toLowerCase()
  const match = (...vals: (string | number | null | undefined)[]) =>
    !q || vals.some(v => String(v ?? '').toLowerCase().includes(q))

  const visibleThemes = [...(themes ?? [])]
    .sort((a, b) => {
      if (sortBy === 'alignment_score') {
        const aScore = alignmentMap.get(a.id)?.score ?? 0
        const bScore = alignmentMap.get(b.id)?.score ?? 0
        return bScore - aScore
      }
      return b.precursor_score - a.precursor_score
    })
    .filter(r => match(r.name, r.category))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('list.search')}
          aria-label={t('list.search')}
          className="min-w-0 w-full sm:w-64 rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
      </div>
      <div className="bg-surface rounded-lg shadow overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm responsive-table">
          <thead className="bg-surface-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">{t('list.col.themeName')}</th>
              <th className="px-4 py-2 text-left">{t('list.col.category')}</th>
              <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => setSortBy('precursor_score')}>
                {t('list.col.precursorScore')} {sortBy === 'precursor_score' ? '↓' : ''}
              </th>
              <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => setSortBy('alignment_score')}>
                {t('list.col.alignmentScore')} {sortBy === 'alignment_score' ? '↓' : ''}
              </th>
              <th className="px-4 py-2 text-center">{t('list.col.trend')}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {visibleThemes.map(row => (
              <tr key={row.id} className="border-t hover:bg-surface-muted cursor-pointer" onClick={() => navigate(`/themes/${row.id}`)}>
                <td className="px-4 py-2 font-medium" data-label={t('list.col.themeName')}>{row.name}</td>
                <td className="px-4 py-2 text-muted-foreground" data-label={t('list.col.category')}>{row.category}</td>
                <td className="px-4 py-2 text-right" data-label={t('list.col.precursorScore')}>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${row.precursor_score >= 70 ? 'bg-red-500' : row.precursor_score >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}>
                    {row.precursor_score.toFixed(0)}
                  </span>
                </td>
                <td className="px-4 py-2 text-right" data-label={t('list.col.alignmentScore')}>
                  {alignmentMap.has(row.id) ? (
                    <div className="inline-flex flex-col items-end gap-0.5">
                      <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-bold">
                        {alignmentMap.get(row.id)!.score.toFixed(0)}
                      </span>
                      {alignmentMap.get(row.id)!.confidence < 0.5 && (
                        <span className="text-xs text-muted-foreground">{t('list.lowConfidence')}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">−</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center" data-label={t('list.col.trend')}>{row.is_trending ? '🔥' : ''}</td>
                <td className="px-4 py-2" data-label="">
                  <button onClick={() => navigate(`/themes/${row.id}`)} className="text-blue-600 hover:underline text-xs">{t('common.detail')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ResearchHubPage() {
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? '') ? (tabParam as Tab) : 'themes'

  const selectTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('research.title')}</h1>
      <div className="flex gap-2 border-b pb-2">
        {TABS.map(tb => (
          <button
            key={tb}
            onClick={() => selectTab(tb)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === tb ? 'border-blue-600 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t(TAB_LABEL_KEY[tb])}
          </button>
        ))}
      </div>

      {tab === 'themes' && <ThemesTab />}
      {tab === 'papers' && <PapersPage />}
      {tab === 'patents' && <PatentsPage />}
    </div>
  )
}
