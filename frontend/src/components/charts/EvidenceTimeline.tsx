import { EmptyChart } from './ChartCard'
import { useI18n } from '../../i18n/useI18n'
import type { MessageKey } from '../../i18n/messages'
import type { ExternalInfo } from '../../types'

// info_type -> 表示ラベルの i18n キー（固定 union 維持のため静的マップ。動的キー生成は避ける）。
const TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  news: 'chart.evidence.type.news',
  announcement: 'chart.evidence.type.announcement',
  earnings: 'chart.evidence.type.earnings',
  filing: 'chart.evidence.type.filing',
}

const TYPE_BADGE: Record<string, string> = {
  news: 'bg-sky-50 text-sky-700 border-sky-200',
  announcement: 'bg-violet-50 text-violet-700 border-violet-200',
  earnings: 'bg-amber-50 text-amber-700 border-amber-200',
  filing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/**
 * G6: 最新エビデンス・タイムライン（SOT-1126）。
 * 外部エビデンス（news/IR/決算/SEC filing）を日付降順で時系列表示。info_type 別バッジ付き。
 */
export default function EvidenceTimeline({ items, max = 20 }: { items: ExternalInfo[]; max?: number }) {
  const { t } = useI18n()
  const sorted = (items ?? [])
    .filter(it => it.published_at)
    .slice()
    .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
    .slice(0, max)

  if (sorted.length === 0) return <EmptyChart message={t('chart.evidence.empty')} />

  const typeLabel = (ty: string) => {
    const k = TYPE_LABEL_KEYS[ty]
    return k ? t(k) : ty
  }
  const typeBadge = (ty: string) => TYPE_BADGE[ty] ?? 'bg-gray-50 text-gray-600 border-gray-200'

  return (
    <ol className="relative ml-2 space-y-4 border-l border-slate-200">
      {sorted.map(it => (
        <li key={it.id} className="ml-4">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-white bg-sky-400" aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs ${typeBadge(it.info_type)}`}>{typeLabel(it.info_type)}</span>
            <time className="text-xs text-slate-400">{it.published_at?.slice(0, 10)}</time>
            {it.related_company && <span className="text-xs text-slate-500">{it.related_company}</span>}
          </div>
          {it.url ? (
            <a
              href={it.url}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 block text-sm font-medium text-slate-800 hover:text-sky-600 hover:underline"
            >
              {it.title}
            </a>
          ) : (
            <p className="mt-0.5 text-sm font-medium text-slate-800">{it.title}</p>
          )}
          {it.summary && <p className="mt-0.5 text-xs text-slate-500">{it.summary}</p>}
          {it.source_name && <p className="mt-0.5 text-xs text-slate-400">{it.source_name}</p>}
        </li>
      ))}
    </ol>
  )
}
