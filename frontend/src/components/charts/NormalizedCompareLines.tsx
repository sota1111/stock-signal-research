import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { toMonthly, validStockItems, SERIES_COLORS, type StockItem } from './chartUtils'

/** A2: 開始日=100に正規化した複数銘柄の比較ライン（相対パフォーマンス）。 */
export default function NormalizedCompareLines({ items }: { items: StockItem[] }) {
  const valid = validStockItems(items)
  if (valid.length === 0) return <EmptyChart message="比較できる株価データがありません" />

  // 各社の月末終値を100基準に正規化し、月キーでマージする
  const merged = new Map<string, Record<string, number | string>>()
  const names: string[] = []
  for (const item of valid) {
    const monthly = toMonthly(item.stock.prices)
    if (monthly.length === 0) continue
    const base = monthly[0].close
    if (base === 0) continue
    names.push(item.name)
    for (const point of monthly) {
      const row = merged.get(point.date) ?? { date: point.date }
      row[item.name] = (point.close / base) * 100
      merged.set(point.date, row)
    }
  }

  const data = Array.from(merged.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)))
  if (data.length === 0 || names.length === 0) return <EmptyChart message="比較できる株価データがありません" />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={48} tickFormatter={d => String(d).slice(0, 4)} />
        <YAxis tick={{ fontSize: 11 }} width={48} domain={['auto', 'auto']} tickFormatter={v => `${Math.round(v)}`} />
        <Tooltip formatter={value => Number(value).toFixed(1)} labelStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {names.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
