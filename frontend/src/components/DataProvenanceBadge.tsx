import { useI18n } from '../i18n/useI18n'

/**
 * SOT-1111 (UI): データ来歴バッジ。各ダッシュボードカードの実データ性を
 * 「実測 / 近似 / 未収集」で明示し、対象範囲・最終収集日時をツールチップで補う。
 * 近似値や未収集データを実測と誤解させないための、人に伝わる表示最適化。
 */
export type ProvenanceKind = 'measured' | 'approx' | 'uncollected'

const KIND_STYLES: Record<ProvenanceKind, string> = {
  measured: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  approx: 'bg-amber-50 text-amber-700 border-amber-200',
  uncollected: 'bg-slate-100 text-slate-500 border-slate-200',
}

export default function DataProvenanceBadge({
  kind,
  scope,
  asOf,
  note,
}: {
  kind: ProvenanceKind
  /** 対象範囲（例: 全100テーマ / 米国中心）。ローカライズ済み文字列を渡す。 */
  scope?: string
  /** 最終収集日時（ローカライズ済み文字列）。 */
  asOf?: string
  /** 補足（例: 論文=実測 / 時価総額=近似）。 */
  note?: string
}) {
  const { t } = useI18n()
  const label = t(`provenance.${kind}` as 'provenance.measured')
  const desc = t(`provenance.${kind}.desc` as 'provenance.measured.desc')

  const tooltipParts = [desc]
  if (scope) tooltipParts.push(`${t('provenance.scope')}: ${scope}`)
  if (asOf) tooltipParts.push(`${t('provenance.asOf')}: ${asOf}`)
  if (note) tooltipParts.push(note)

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${KIND_STYLES[kind]}`}
      title={tooltipParts.join(' / ')}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
      {scope && <span className="font-normal opacity-80">· {scope}</span>}
    </span>
  )
}

/** カード群の下に置く凡例（実測/近似/未収集の意味を一目で示す）。 */
export function DataProvenanceLegend() {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <span className="font-medium text-slate-600">{t('provenance.legend.title')}:</span>
      <DataProvenanceBadge kind="measured" />
      <span>{t('provenance.measured.desc')}</span>
      <DataProvenanceBadge kind="approx" />
      <span>{t('provenance.approx.desc')}</span>
      <DataProvenanceBadge kind="uncollected" />
      <span>{t('provenance.uncollected.desc')}</span>
    </div>
  )
}
