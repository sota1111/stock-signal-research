import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'

/**
 * ChartCard — shared surface for every dashboard widget (SOT-1019 design renewal).
 * Provides one elevation/hierarchy language: token-driven surface + border + card
 * shadow that lifts on hover, a clear title/subtitle header, and an optional
 * `actions` slot. `dense` tightens padding for the compact information-density mode.
 * Numeric content inherits tabular figures via the `.nums` helper.
 */
export default function ChartCard({
  title,
  subtitle,
  actions,
  dense = false,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  dense?: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`bg-surface rounded-xl border border-slate-200/80 shadow-card transition-shadow hover:shadow-card-hover ${
        dense ? 'p-3' : 'p-4'
      }`}
    >
      <div className={`flex items-start justify-between gap-3 ${dense ? 'mb-2' : 'mb-3'}`}>
        <div className="min-w-0">
          <p className="font-semibold tracking-tight text-slate-800">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
      <div className="nums">{children}</div>
    </div>
  )
}

export function EmptyChart({ message }: { message?: string }) {
  const { t } = useI18n()
  return <p className="text-sm text-gray-400 py-8 text-center">{message ?? t('chart.empty.default')}</p>
}
