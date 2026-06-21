import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { InstitutionalInvestor } from '../../types'
import { useI18n } from '../../i18n/useI18n'

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

/**
 * 機関投資家の保有比率(%)の四半期推移（SOT-995 /investors-1）。
 * 1企業に対する各投資家の ownership_pct を report_date 軸で重ねて描画する。
 */
export default function HoldingsTrendLines({ rows }: { rows: InstitutionalInvestor[] }) {
  const { t } = useI18n()
  const dates = [...new Set(rows.map(r => r.report_date))].sort()
  const investorNames = [...new Set(rows.map(r => r.investor_name))]

  if (dates.length < 2 || investorNames.length === 0) {
    return <EmptyChart message={t('investors.trend.empty')} />
  }

  const byDate = new Map<string, Record<string, number | string>>()
  for (const d of dates) byDate.set(d, { date: d })
  for (const r of rows) {
    const row = byDate.get(r.report_date)
    if (row) row[r.investor_name] = r.ownership_pct
  }
  const data = dates.map(d => byDate.get(d)!)

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={v => `${v}%`} />
        <Tooltip labelStyle={{ fontSize: 12 }} formatter={v => `${Number(v).toFixed(2)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {investorNames.map((name, i) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
