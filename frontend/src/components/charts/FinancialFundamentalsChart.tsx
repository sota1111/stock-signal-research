import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { SERIES_COLORS, formatCompact } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'
import type { MessageKey } from '../../i18n/messages'
import type { FinancialFundamentals } from '../../types'

// 指標キー -> 凡例ラベルの i18n キー。
const METRIC_LABEL_KEYS: Record<string, MessageKey> = {
  revenue: 'fundamentals.metric.revenue',
  gross_profit: 'fundamentals.metric.gross_profit',
  rnd: 'fundamentals.metric.rnd',
  capex: 'fundamentals.metric.capex',
}

/** 財務ファンダメンタルズ年次時系列（売上/粗利/R&D/capex / SOT-1121・SEC EDGAR XBRL）。 */
export default function FinancialFundamentalsChart({ data }: { data?: FinancialFundamentals }) {
  const { t } = useI18n()
  if (!data || data.series.length === 0 || data.points.length === 0) {
    return <EmptyChart message={t('fundamentals.empty')} />
  }

  // 指標キー -> 凡例ラベル（i18n）。未知キーはそのまま表示。
  const label = (key: string) => {
    const mk = METRIC_LABEL_KEYS[key]
    return mk ? t(mk) : key
  }

  // points -> recharts 行（year + 各指標列）。
  const rows = data.points.map(p => ({ year: p.year, ...p.values }))
  const fmt = (v: number) => `$${formatCompact(v)}`

  return (
    <ResponsiveContainer width="100%" height={360}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} minTickGap={24} />
        <YAxis tick={{ fontSize: 11 }} width={56} tickFormatter={fmt} />
        <Tooltip
          formatter={(value, name) => [fmt(Number(value)), name as string]}
          labelStyle={{ fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {data.series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={label(s.key)}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            dot={false}
            strokeWidth={2}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
