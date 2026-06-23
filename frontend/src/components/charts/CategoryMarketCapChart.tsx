import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { SERIES_COLORS, formatCompact } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'
import type { CategoryMarketCap } from '../../types'

/** カテゴリ別 真の歴史的時価総額の年次推移（上位N社 / SOT-1056 B-3）。 */
export default function CategoryMarketCapChart({ data }: { data?: CategoryMarketCap }) {
  const { t } = useI18n()
  if (!data || data.series.length === 0 || data.points.length === 0) {
    return <EmptyChart message={t('category.empty')} />
  }

  // points -> recharts 行（year + 各ティッカー列）。
  const rows = data.points.map(p => ({ year: p.year, ...p.values }))
  const fmt = (v: number) => `$${formatCompact(v)}`

  // 系列の表示名: 非米国(USD以外/取引所あり)は通貨・上場市場を併記する。
  const displayName = (s: typeof data.series[number]) =>
    s.exchange && s.currency && s.currency !== 'USD'
      ? `${s.name} (${s.exchange} · ${s.currency})`
      : s.name

  // いずれかの系列が非米国の近似値なら脚注を出す。
  const hasApprox = data.series.some(
    s => s.provenance === 'approx' || (s.currency && s.currency !== 'USD'),
  )

  return (
    <div>
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
              name={displayName(s)}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              dot={false}
              strokeWidth={2}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {hasApprox && (
        <p style={{ fontSize: 11, color: '#888', margin: '4px 8px 0' }}>
          {t('category.nonUsApprox')}
        </p>
      )}
    </div>
  )
}
