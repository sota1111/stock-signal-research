import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { pctReturn, validStockItems, type StockItem } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'

/** A3: 10年騰落率ランキング（横棒）。プラス=赤 / マイナス=青。 */
export default function ReturnRankingBar({ items }: { items: StockItem[] }) {
  const { t } = useI18n()
  const valid = validStockItems(items)
  const data = valid
    .map(item => ({ name: item.name, ret: pctReturn(item.stock.prices) }))
    .filter((d): d is { name: string; ret: number } => d.ret != null)
    .sort((a, b) => b.ret - a.ret)

  if (data.length === 0) return <EmptyChart message={t('chart.empty.return')} />

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
        <Tooltip formatter={value => `${Number(value).toFixed(1)}%`} labelStyle={{ fontSize: 12 }} />
        <Bar dataKey="ret" radius={[0, 4, 4, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.ret >= 0 ? '#ef4444' : '#3b82f6'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
