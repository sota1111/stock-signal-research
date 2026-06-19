import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { PaperMonthlyCount } from '../../types'

/** B2: テーマ横断の月次論文件数トレンド（年月ごとに合算した折れ線）。 */
export default function MonthlyPapersLine({ data }: { data: PaperMonthlyCount[] }) {
  if (!data || data.length === 0) return <EmptyChart message="月次データがありません" />

  const byMonth = new Map<string, number>()
  for (const row of data) {
    byMonth.set(row.year_month, (byMonth.get(row.year_month) ?? 0) + row.count)
  }
  const series = Array.from(byMonth.entries())
    .map(([year_month, count]) => ({ year_month, count }))
    .sort((a, b) => a.year_month.localeCompare(b.year_month))

  if (series.length === 0) return <EmptyChart message="月次データがありません" />

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year_month" tick={{ fontSize: 11 }} minTickGap={40} />
        <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <Tooltip labelStyle={{ fontSize: 12 }} formatter={value => [`${value} 件`, '論文件数']} />
        <Line type="monotone" dataKey="count" stroke="#10b981" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}
