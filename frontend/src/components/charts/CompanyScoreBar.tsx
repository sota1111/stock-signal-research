import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { TopCompany } from '../../types'

/** B4: 注目企業の前兆スコア（横棒）。 */
export default function CompanyScoreBar({ data }: { data: TopCompany[] }) {
  if (!data || data.length === 0) return <EmptyChart message="注目企業データがありません" />

  const sorted = [...data].sort((a, b) => b.score - a.score)

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 40)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 8, right: 32, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="company" tick={{ fontSize: 11 }} width={130} />
        <Tooltip labelStyle={{ fontSize: 12 }} formatter={value => [Number(value).toFixed(1), 'スコア']} />
        <Bar dataKey="score" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
