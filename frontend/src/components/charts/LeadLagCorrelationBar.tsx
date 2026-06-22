import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { LeadLagResult } from '../../pages/leadLagData'
import { useI18n } from '../../i18n/useI18n'

/** ラグ（月）別に「論文増加 → 株価リターン」相関係数を棒で表示する。 */
export default function LeadLagCorrelationBar({ results }: { results: LeadLagResult[] }) {
  const { t } = useI18n()
  const data = results
    .filter(r => r.corr != null)
    .map(r => ({ lag: r.lag, corr: Number((r.corr as number).toFixed(3)), n: r.n }))
  if (data.length === 0) return <EmptyChart message={t('candidates.leadlag.noData')} />

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis
          dataKey="lag"
          tick={{ fontSize: 11 }}
          tickFormatter={v => t('candidates.leadlag.lagLabel', { n: Number(v) })}
        />
        <YAxis domain={[-1, 1]} tick={{ fontSize: 11 }} width={40} />
        <ReferenceLine y={0} stroke="#94a3b8" />
        <Tooltip
          labelFormatter={v => t('candidates.leadlag.lagLabel', { n: Number(v) })}
          formatter={value => [value == null ? '' : String(value), t('candidates.leadlag.corr')]}
        />
        <Bar dataKey="corr" radius={[4, 4, 0, 0]}>
          {data.map(d => (
            <Cell key={d.lag} fill={d.corr >= 0 ? '#10b981' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
