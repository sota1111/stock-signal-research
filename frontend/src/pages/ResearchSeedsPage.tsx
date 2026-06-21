import { useQuery } from '@tanstack/react-query'
import { fetchResearchSeeds } from '../api'
import type { ResearchSeed, ResearchSeedPaper } from '../types'
import { useI18n } from '../i18n/useI18n'
import { seedTextEn } from '../i18n/seedTranslations'

const paperHref = (p: ResearchSeedPaper): string | undefined =>
  p.url ?? (p.doi ? `https://doi.org/${p.doi}` : p.arxivId ? `https://arxiv.org/abs/${p.arxivId}` : undefined)

const CONFIDENCE_STYLE: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600 border-gray-300',
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

function SeedCard({ seed }: { seed: ResearchSeed }) {
  const { t, lang } = useI18n()
  const en = lang === 'en' ? seedTextEn[seed.id] : undefined
  const theme = en?.theme ?? seed.theme
  const summary = (en?.summary ?? seed.summary) || ''
  const hypothesis = en?.hypothesis ?? seed.hypothesis
  const reason = en?.reason ?? seed.reason_to_track
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{theme}</h2>
          <p className="text-sm text-gray-500">
            {seed.symbol && <span className="font-mono mr-2">{seed.symbol}</span>}
            {seed.company_name}
          </p>
        </div>
        <ConfidenceBadge confidence={seed.confidence} />
      </div>

      {seed.related_keywords?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {seed.related_keywords.map(k => (
            <span key={k} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{k}</span>
          ))}
        </div>
      )}

      {summary && <p className="text-sm text-gray-700 mb-3">{summary}</p>}

      <dl className="space-y-1 text-sm">
        {hypothesis && (
          <div className="flex gap-2">
            <dt className="text-gray-500 shrink-0 w-20">{t('seeds.hypothesis')}</dt>
            <dd className="text-gray-700">{hypothesis}</dd>
          </div>
        )}
        {reason && (
          <div className="flex gap-2">
            <dt className="text-gray-500 shrink-0 w-20">{t('seeds.reason')}</dt>
            <dd className="text-gray-700">{reason}</dd>
          </div>
        )}
        {seed.source_reference && (
          <div className="flex gap-2">
            <dt className="text-gray-500 shrink-0 w-20">{t('seeds.source')}</dt>
            <dd className="text-gray-600">{seed.source_reference}</dd>
          </div>
        )}
      </dl>

      {seed.papers?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">{t('seeds.relatedPapers')}</p>
          <ul className="list-disc list-inside text-xs text-gray-600">
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

      <div className="mt-3 pt-2 border-t text-xs text-gray-400">
        {t('seeds.registeredAt')}: {seed.created_at ?? '—'}
      </div>
    </div>
  )
}

export default function ResearchSeedsPage() {
  const { t } = useI18n()
  const { data: seeds, isLoading, isError } = useQuery({
    queryKey: ['research-seeds'],
    queryFn: fetchResearchSeeds,
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">{t('seeds.title')}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {t('seeds.subtitle')}
      </p>

      {isLoading && <p className="text-gray-500">{t('common.loading')}</p>}
      {isError && <p className="text-red-600">{t('common.loadError')}</p>}

      {seeds && seeds.length === 0 && (
        <p className="text-gray-500">{t('seeds.empty')}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {seeds?.map(seed => <SeedCard key={seed.id} seed={seed} />)}
      </div>
    </div>
  )
}
