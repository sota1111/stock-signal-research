import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { SurgingKeyword } from '../../types'

/** B3: 急増キーワード（成長率の横棒、上位10件）。 */
export default function SurgingKeywordsBar({ data }: { data: SurgingKeyword[] }) {
  if (!data || data.length === 0) return <EmptyChart message="急増キーワードがありません" />

  const top = [...data].sort((a, b) => b.growth_rate - a.growth_rate).slice(0, 10)

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, top.length * 36)}>
      <BarChart data={top} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}x`} />
        <YAxis type="category" dataKey="keyword" tick={{ fontSize: 11 }} width={120} />
        <Tooltip labelStyle={{ fontSize: 12 }} formatter={value => [`${Number(value).toFixed(2)}x`, '成長率']} />
        <Bar dataKey="growth_rate" fill="#f59e0b" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
