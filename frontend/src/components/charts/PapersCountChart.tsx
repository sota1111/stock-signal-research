import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { PaperYearCount } from '../../types'

/**
 * SOT-943: 年別の論文件数を単独の棒グラフで表示する。
 */
export default function PapersCountChart({ counts }: { counts: PaperYearCount[] }) {
  if (!counts || counts.length === 0) return <EmptyChart message="論文データがありません" />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={counts} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={(value, name) => [`${value} 件`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" name="論文件数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
