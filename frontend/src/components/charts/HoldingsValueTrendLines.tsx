import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { SERIES_COLORS, formatCompact } from './chartUtils'
import type { InstitutionalInvestor } from '../../types'

/**
 * 1投資家分の保有「金額(評価額 value_usd)」の推移（SOT-1187: 投資家ごとに分割）。
 * 渡された rows（=1投資家分）について、各 report_date の保有額合計（全企業の value_usd
 * 合算）を1本の折れ線として描画する。Y軸はこのカード単独でオートスケールするため、
 * 投資家ごとに桁が違っても0付近に潰れない。保有比率(%)を描く HoldingsTrendLines とは別物。
 */
export default function HoldingsValueTrendLines({ rows }: { rows: InstitutionalInvestor[] }) {
  const value = (r: InstitutionalInvestor) => r.value_usd ?? 0
  const dates = [...new Set(rows.map(r => r.report_date))].sort()

  if (dates.length < 2) {
    return <EmptyChart />
  }

  // (date → 保有額合計) を構築し、1本の系列にする。
  const totalByDate = new Map<string, number>()
  for (const d of dates) totalByDate.set(d, 0)
  for (const r of rows) {
    if (!totalByDate.has(r.report_date)) continue
    totalByDate.set(r.report_date, (totalByDate.get(r.report_date) ?? 0) + value(r))
  }
  const data = dates.map(d => ({ date: d, value: totalByDate.get(d) ?? 0 }))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={v => `$${formatCompact(Number(v))}`} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={v => `$${formatCompact(Number(v))}`}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={SERIES_COLORS[0]}
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
