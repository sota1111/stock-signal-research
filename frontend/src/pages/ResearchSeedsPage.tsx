import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchResearchSeeds, fetchThemes } from '../api'
import type { ResearchSeed, ResearchSeedPaper } from '../types'
import { useI18n } from '../i18n/useI18n'
import { seedTextEn } from '../i18n/seedTranslations'

const paperHref = (p: ResearchSeedPaper): string | undefined =>
  p.url ?? (p.doi ? `https://doi.org/${p.doi}` : p.arxivId ? `https://arxiv.org/abs/${p.arxivId}` : undefined)

const CONFIDENCE_STYLE: Record<string, string> = {
  low: 'bg-gray-100 text-muted-foreground border-gray-300',
  medium: 'bg-amber-100 text-amber-700 border-amber-300',
  high: 'bg-green-100 text-green-700 border-green-300',
}

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const style = CONFIDENCE_STYLE[confidence ?? ''] ?? CONFIDENCE_STYLE.low
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${style}`}>
      confidence: {confidence ?? 'low'}
    </span>
  )
}

function SeedCard({ seed, adopted }: { seed: ResearchSeed; adopted: boolean }) {
  const { t, lang } = useI18n()
  const en = lang === 'en' ? seedTextEn[seed.id] : undefined
  const theme = en?.theme ?? seed.theme
  const summary = (en?.summary ?? seed.summary) || ''
  const hypothesis = en?.hypothesis ?? seed.hypothesis
  const reason = en?.reason ?? seed.reason_to_track
  return (
    <div className="bg-surface rounded-lg shadow p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{theme}</h2>
          <p className="text-sm text-muted-foreground">
            {seed.symbol && <span className="font-mono mr-2">{seed.symbol}</span>}
            {seed.company_name}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {/* 採用状況バッジ（テーマ化済/未着手, SOT-995 /research-seeds-3） */}
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${adopted ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-100 text-muted-foreground border-gray-300'}`}>
            {adopted ? t('seeds.adopted') : t('seeds.notAdopted')}
          </span>
          <ConfidenceBadge confidence={seed.confidence} />
        </div>
      </div>

      {seed.related_keywords?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {seed.related_keywords.map(k => (
            <span key={k} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{k}</span>
          ))}
        </div>
      )}

      {summary && <p className="text-sm text-foreground mb-3">{summary}</p>}

      <dl className="space-y-1 text-sm">
        {hypothesis && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground shrink-0 w-20">{t('seeds.hypothesis')}</dt>
            <dd className="text-foreground">{hypothesis}</dd>
          </div>
        )}
        {reason && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground shrink-0 w-20">{t('seeds.reason')}</dt>
            <dd className="text-foreground">{reason}</dd>
          </div>
        )}
        {seed.source_reference && (
          <div className="flex gap-2">
            <dt className="text-muted-foreground shrink-0 w-20">{t('seeds.source')}</dt>
            <dd className="text-muted-foreground">{seed.source_reference}</dd>
          </div>
        )}
      </dl>

      {seed.papers?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1">{t('seeds.relatedPapers')}</p>
          <ul className="list-disc list-inside text-xs text-muted-foreground">
            {seed.papers.map((p, i) => {
              const href = paperHref(p)
              return (
                <li key={i}>
                  {href
                    ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{p.title}</a>
                    : p.title}
                  {p.year ? ` (${p.year})` : ''}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="mt-3 pt-2 border-t flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{t('seeds.registeredAt')}: {seed.created_at ?? '—'}</span>
        {/* シード→関連テーマ分析への導線（SOT-995 /research-seeds-2,5） */}
        <Link to={`/papers?theme=${encodeURIComponent(seed.theme)}`} className="text-blue-600 hover:underline">{t('seeds.analyze')}</Link>
      </div>
    </div>
  )
}

export default function ResearchSeedsPage() {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const { data: seeds, isLoading, isError } = useQuery({
    queryKey: ['research-seeds'],
    queryFn: fetchResearchSeeds,
  })
  // 採用状況判定用にテーマ名の集合を取得（SOT-995 /research-seeds-3）。
  const { data: themes } = useQuery({ queryKey: ['themes'], queryFn: fetchThemes })
  const themeNames = new Set((themes ?? []).map(th => th.name.toLowerCase()))

  const q = search.trim().toLowerCase()
  const filteredSeeds = (seeds ?? []).filter(s =>
    !q || [s.theme, s.company_name, s.symbol, ...(s.related_keywords ?? [])]
      .some(v => String(v ?? '').toLowerCase().includes(q)),
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-2">{t('seeds.title')}</h1>
      <p className="text-sm text-muted-foreground mb-4">
        {t('seeds.subtitle')}
      </p>

      {/* 検索 + /登録 への統合導線（SOT-995 /research-seeds-1,4） */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('seeds.search')}
          aria-label={t('seeds.search')}
          className="min-w-0 w-full sm:w-72 rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <Link to="/input" className="rounded-md border border-gray-300 bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted">
          {t('seeds.register')}
        </Link>
      </div>

      {isLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {isError && <p className="text-red-600">{t('common.loadError')}</p>}

      {seeds && seeds.length === 0 && (
        <p className="text-muted-foreground">{t('seeds.empty')}</p>
      )}
      {seeds && seeds.length > 0 && filteredSeeds.length === 0 && (
        <p className="text-muted-foreground">{t('seeds.noMatch')}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {filteredSeeds.map(seed => (
          <SeedCard key={seed.id} seed={seed} adopted={themeNames.has(seed.theme.toLowerCase())} />
        ))}
      </div>
    </div>
  )
}
