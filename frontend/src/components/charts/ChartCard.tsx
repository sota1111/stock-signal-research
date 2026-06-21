import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'

export default function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="mb-3">
        <p className="font-semibold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

export function EmptyChart({ message }: { message?: string }) {
  const { t } = useI18n()
  return <p className="text-sm text-gray-400 py-8 text-center">{message ?? t('chart.empty.default')}</p>
}
