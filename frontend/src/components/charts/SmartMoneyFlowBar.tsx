import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { formatCompact } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'

export interface SmartMoneyFlowItem {
  name: string
  delta: number
}

/**
 * G3: スマートマネー・フロー 発散棒グラフ（SOT-1126）。
 * 13F の最新四半期Δ（保有株数の増減）を企業単位で集計し、積み増し=緑 / 減らし=赤 の横棒で表示する。
 */
export default function SmartMoneyFlowBar({ items }: { items: SmartMoneyFlowItem[] }) {
  const { t } = useI18n()
  if (!items || items.length === 0) return <EmptyChart message={t('chart.smartMoney.empty')} />

  const height = Math.max(180, items.length * 32 + 48)
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart layout="vertical" data={items} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => formatCompact(v)} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={value => {
            const num = Number(value)
            return [`${num > 0 ? '+' : ''}${num.toLocaleString()} ${t('chart.smartMoney.unit')}`, t('chart.smartMoney.delta')]
          }}
        />
        <ReferenceLine x={0} stroke="#94a3b8" />
        <Bar dataKey="delta" name={t('chart.smartMoney.delta')}>
          {items.map((it, i) => (
            <Cell key={i} fill={it.delta >= 0 ? '#10b981' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
