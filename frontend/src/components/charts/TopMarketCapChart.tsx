import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { formatCompact } from './chartUtils'

/**
 * SOT-943: 上位N社の時価総額合計の年次推移を単独のエリアグラフで表示する。
 * データは現在の時価総額 × 株価比率による近似（buildTopMarketCapYearly 参照）。
 */
export default function TopMarketCapChart({
  data,
  topN = 10,
}: {
  data: { year: number; total: number }[]
  topN?: number
}) {
  if (!data || data.length === 0) return <EmptyChart message="時価総額データがありません" />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={v => formatCompact(v)} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={(value, name) => [formatCompact(Number(value)), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="total"
          name={`上位${topN}社 時価総額合計`}
          stroke="#10b981"
          fill="#10b981"
          fillOpacity={0.15}
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
