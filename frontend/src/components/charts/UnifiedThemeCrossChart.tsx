import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { toYearly, formatCompact } from './chartUtils'
import type { PaperYearCount, StockData } from '../../types'

/**
 * SOT-894: 論文件数（棒）・株価年末終値（線）・クロス分析（指数・線）を同一グラフに統合した複合チャート。
 * クロス分析 = 論文件数と株価をそれぞれ最初の共通年=100で正規化し、その平均を取った合成指数。
 */
export default function UnifiedThemeCrossChart({
  counts,
  stock,
  companyName,
}: {
  counts: PaperYearCount[]
  stock?: StockData
  companyName?: string
}) {
  if (!counts || counts.length === 0) return <EmptyChart message="論文データがありません" />

  const yearly = stock && !stock.error ? toYearly(stock.prices) : new Map<number, number>()
  const hasPrice = yearly.size > 0

  // 論文件数・株価それぞれの基準値（最初に両方が揃う年）を求める
  const firstCommon = counts.find(c => c.count > 0 && yearly.has(c.year))
  const basePaper = firstCommon ? firstCommon.count : null
  const basePrice = firstCommon ? yearly.get(firstCommon.year)! : null

  const data = counts.map(c => {
    const close = yearly.has(c.year) ? yearly.get(c.year)! : null
    let cross: number | null = null
    if (basePaper && basePrice && close != null && c.count > 0) {
      const paperIdx = (c.count / basePaper) * 100
      const priceIdx = (close / basePrice) * 100
      cross = (paperIdx + priceIdx) / 2
    }
    return { year: c.year, count: c.count, close, cross }
  })

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={52} tickFormatter={v => formatCompact(v)} />
        {/* クロス分析(指数)専用の非表示軸。論文件数(棒)と軸を共有すると指数値(≈100〜200)に
            スケールが引っ張られ棒が潰れて見えなくなるため、独立スケールに分離する。 */}
        <YAxis yAxisId="cross" orientation="right" hide domain={['auto', 'auto']} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={(value, name) => {
            if (value == null) return ['-', name]
            const label = String(name)
            if (label.startsWith('株価')) return [formatCompact(Number(value)), name]
            if (label.startsWith('クロス分析')) return [Number(value).toFixed(0), name]
            return [`${value} 件`, name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="count" name="論文件数" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        {hasPrice && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="close"
            name={`株価(年末)${companyName ? ` ${companyName}` : ''}`}
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        )}
        {hasPrice && basePaper != null && (
          <Line
            yAxisId="cross"
            type="monotone"
            dataKey="cross"
            name="クロス分析(指数)"
            stroke="#8b5cf6"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 2 }}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
