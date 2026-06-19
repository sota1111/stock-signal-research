import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { PaperYearCount } from '../../types'

/** B1: 年別論文件数の推移（棒）。 */
export default function PaperCountsByYearBar({ data }: { data: PaperYearCount[] }) {
  if (!data || data.length === 0) return <EmptyChart message="論文データがありません" />

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <Tooltip labelStyle={{ fontSize: 12 }} formatter={value => [`${value} 件`, '論文件数']} />
        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
