import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { formatCompact } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'
import type { ResearchPerformancePoint } from '../../pages/dashboardData'

/**
 * G1: 研究→業績 連鎖チャート（SOT-1126）。
 * 構成企業の財務時系列を集計し、左軸=売上（棒）／右軸=粗利率%・R&D比率%（折れ線）の複合表示で
 * 「R&D 投資 → 業績」の連鎖を可視化する。
 */
export default function ResearchToPerformanceChart({ data }: { data: ResearchPerformancePoint[] }) {
  const { t } = useI18n()
  if (!data || data.length === 0) return <EmptyChart message={t('chart.research.empty')} />

  const revenueLabel = t('chart.research.revenue')
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} minTickGap={24} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={56} tickFormatter={v => `$${formatCompact(v)}`} />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11 }}
          width={44}
          domain={[0, 'auto']}
          tickFormatter={v => `${v}%`}
        />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={(value, name) => {
            const num = Number(value)
            if (name === revenueLabel) return [`$${formatCompact(num)}`, name as string]
            return [`${num.toFixed(1)}%`, name as string]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="revenue" name={revenueLabel} fill="#3b82f6" fillOpacity={0.35} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="grossMarginPct"
          name={t('chart.research.grossMargin')}
          stroke="#10b981"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="rndRatioPct"
          name={t('chart.research.rndRatio')}
          stroke="#f59e0b"
          dot={false}
          strokeWidth={2}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
