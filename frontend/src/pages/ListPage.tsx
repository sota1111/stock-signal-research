import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchThemes, fetchPapers, fetchCompanies, fetchInvestors, fetchDashboard } from '../api'
import { useI18n } from '../i18n/useI18n'
import type { MessageKey } from '../i18n/messages'

const TABS = ['テーマ', '論文', '企業', '投資家'] as const
type Tab = typeof TABS[number]
const TAB_LABEL_KEY: Record<Tab, MessageKey> = {
  'テーマ': 'list.tab.themes',
  '論文': 'list.tab.papers',
  '企業': 'list.tab.companies',
  '投資家': 'list.tab.investors',
}
// ナビ等の URL クエリ(?tab=)からタブを初期選択する（SOT-995 /list, ナビのテーマ導線対応）。
const TAB_FROM_QUERY: Record<string, Tab> = {
  themes: 'テーマ', papers: '論文', companies: '企業', investors: '投資家',
}

export default function ListPage() {
  const { t } = useI18n()
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>(TAB_FROM_QUERY[searchParams.get('tab') ?? ''] ?? 'テーマ')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  // 横断検索（全タブ共通, SOT-995 /list-1）。指定列の値いずれかに部分一致でフィルタ。
  const q = search.trim().toLowerCase()
  const match = (...vals: (string | number | null | undefined)[]) =>
    !q || vals.some(v => String(v ?? '').toLowerCase().includes(q))

  // 数値列のソート方向（タブ別, SOT-995 /list-2）。
  const [paperSortDesc, setPaperSortDesc] = useState(true)
  const [companySortDesc, setCompanySortDesc] = useState(true)
  const [investorSortDesc, setInvestorSortDesc] = useState(true)

  const { data: themes } = useQuery({ queryKey: ['themes'], queryFn: fetchThemes, enabled: tab === 'テーマ' })
  const { data: papers } = useQuery({ queryKey: ['papers'], queryFn: () => fetchPapers(), enabled: tab === '論文' })
  const { data: companies } = useQuery({ queryKey: ['companies'], queryFn: fetchCompanies, enabled: tab === '企業' })
  const { data: investors } = useQuery({ queryKey: ['investors'], queryFn: fetchInvestors, enabled: tab === '投資家' })
  const { data: dashboard } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard, enabled: tab === 'テーマ' })

  const alignmentMap = new Map<string, { score: number; confidence: number }>()
  dashboard?.alignment_highlights?.high_alignment?.forEach(item => {
    alignmentMap.set(item.theme.id, { score: item.score, confidence: item.confidence })
  })

  const [sortBy, setSortBy] = useState<'precursor_score' | 'alignment_score'>('precursor_score')
  const sortedThemes = [...(themes ?? [])].sort((a, b) => {
    if (sortBy === 'alignment_score') {
      const aScore = alignmentMap.get(a.id)?.score ?? 0
      const bScore = alignmentMap.get(b.id)?.score ?? 0
      return bScore - aScore
    }
    return b.precursor_score - a.precursor_score
  })

  // 横断検索 + 数値ソート適用（SOT-995 /list-1,2）。
  const visibleThemes = sortedThemes.filter(r => match(r.name, r.category))
  const visiblePapers = [...(papers ?? [])]
    .filter(p => match(p.title, p.source, p.published_at))
    .sort((a, b) => (paperSortDesc ? 1 : -1) * ((b.citation_count ?? 0) - (a.citation_count ?? 0)))
  const visibleCompanies = [...(companies ?? [])]
    .filter(c => match(c.name, c.ticker, c.benefit_type))
    .sort((a, b) => (companySortDesc ? 1 : -1) * (b.benefit_score - a.benefit_score))
  const visibleInvestors = [...(investors ?? [])]
    .filter(inv => match(inv.investor_name, inv.company_name, inv.report_type, inv.report_date))
    .sort((a, b) => (investorSortDesc ? 1 : -1) * (b.ownership_pct - a.ownership_pct))

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('list.title')}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b pb-2">
        <div className="flex gap-2">
          {TABS.map(tb => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === tb ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t(TAB_LABEL_KEY[tb])}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('list.search')}
          aria-label={t('list.search')}
          className="min-w-0 w-full sm:w-64 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
      </div>

      {tab === 'テーマ' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm responsive-table">
            <thead className="bg-gray-50 text-gray-600">
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
                <tr key={row.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/themes/${row.id}`)}>
                  <td className="px-4 py-2 font-medium" data-label={t('list.col.themeName')}>{row.name}</td>
                  <td className="px-4 py-2 text-gray-500" data-label={t('list.col.category')}>{row.category}</td>
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
                          <span className="text-xs text-gray-400">{t('list.lowConfidence')}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">−</span>
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
      )}

      {tab === '論文' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm responsive-table">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">{t('list.col.title')}</th>
                <th className="px-4 py-2 text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => setPaperSortDesc(v => !v)}>
                  {t('list.col.citations')} {paperSortDesc ? '↓' : '↑'}
                </th>
                <th className="px-4 py-2 text-left">{t('list.col.publishedAt')}</th>
                <th className="px-4 py-2 text-left">{t('list.col.source')}</th>
              </tr>
            </thead>
            <tbody>
              {visiblePapers.map(p => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2" data-label={t('list.col.title')}>
                    {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{p.title}</a> : p.title}
                  </td>
                  <td className="px-4 py-2 text-right font-medium whitespace-nowrap" data-label={t('list.col.citations')}>
                    {(p.citation_count ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap" data-label={t('list.col.publishedAt')}>{p.published_at ?? '-'}</td>
                  <td className="px-4 py-2 text-gray-500" data-label={t('list.col.source')}>{p.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === '企業' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm responsive-table">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">{t('list.col.companyName')}</th>
                <th className="px-4 py-2 text-left">{t('list.col.ticker')}</th>
                <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => setCompanySortDesc(v => !v)}>
                  {t('list.col.benefitScore')} {companySortDesc ? '↓' : '↑'}
                </th>
                <th className="px-4 py-2 text-center">{t('list.col.benefitType')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleCompanies.map(c => (
                <tr key={c.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium" data-label={t('list.col.companyName')}>{c.name}</td>
                  <td className="px-4 py-2 text-gray-500" data-label={t('list.col.ticker')}>{c.ticker ?? '-'}</td>
                  <td className="px-4 py-2 text-right" data-label={t('list.col.benefitScore')}>
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">{c.benefit_score.toFixed(0)}</span>
                  </td>
                  <td className="px-4 py-2 text-center" data-label={t('list.col.benefitType')}>
                    <span className={`text-xs px-2 py-0.5 rounded ${c.benefit_type === 'direct' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {c.benefit_type === 'direct' ? t('benefit.directShort') : t('benefit.indirectShort')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === '投資家' && (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm responsive-table">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">{t('list.col.investorName')}</th>
                <th className="px-4 py-2 text-right cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => setInvestorSortDesc(v => !v)}>
                  {t('list.col.ownership')} {investorSortDesc ? '↓' : '↑'}
                </th>
                <th className="px-4 py-2 text-right">{t('list.col.change')}</th>
                <th className="px-4 py-2 text-left">{t('list.col.reportDate')}</th>
                <th className="px-4 py-2 text-left">{t('list.col.reportType')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvestors.map(inv => (
                <tr key={inv.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium" data-label={t('list.col.investorName')}>{inv.investor_name}</td>
                  <td className="px-4 py-2 text-right" data-label={t('list.col.ownership')}>{inv.ownership_pct.toFixed(2)}%</td>
                  <td className={`px-4 py-2 text-right ${inv.change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`} data-label={t('list.col.change')}>
                    {inv.change_pct >= 0 ? '+' : ''}{inv.change_pct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2 text-gray-500" data-label={t('list.col.reportDate')}>{inv.report_date}</td>
                  <td className="px-4 py-2 text-gray-500" data-label={t('list.col.reportType')}>{inv.report_type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
