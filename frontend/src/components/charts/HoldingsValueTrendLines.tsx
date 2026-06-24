import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { SERIES_COLORS, formatCompact } from './chartUtils'
import type { InstitutionalInvestor } from '../../types'

/**
 * 機関投資家の保有「金額(評価額 value_usd)」の推移（SOT-1177）。
 * 各 report_date における投資家ごとの保有額合計（全企業の value_usd 合算）を
 * 1本の線として重ねて描画する。保有比率(%)を描く HoldingsTrendLines とは別物。
 */
export default function HoldingsValueTrendLines({ rows }: { rows: InstitutionalInvestor[] }) {
  const value = (r: InstitutionalInvestor) => r.value_usd ?? 0
  const dates = [...new Set(rows.map(r => r.report_date))].sort()
  const investorNames = [...new Set(rows.map(r => r.investor_name))]

  if (dates.length < 2 || investorNames.length === 0) {
    return <EmptyChart />
  }

  // (date → {date, 投資家名: 保有額合計}) を構築する。
  const byDate = new Map<string, Record<string, number | string>>()
  for (const d of dates) byDate.set(d, { date: d })
  for (const r of rows) {
    const row = byDate.get(r.report_date)
    if (!row) continue
    row[r.investor_name] = (Number(row[r.investor_name] ?? 0)) + value(r)
  }
  const data = dates.map(d => byDate.get(d)!)

  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={v => `$${formatCompact(Number(v))}`} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={v => `$${formatCompact(Number(v))}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {investorNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
