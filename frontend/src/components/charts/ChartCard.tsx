import type { ReactNode } from 'react'

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

export function EmptyChart({ message = 'データがありません' }: { message?: string }) {
  return <p className="text-sm text-gray-400 py-8 text-center">{message}</p>
}
