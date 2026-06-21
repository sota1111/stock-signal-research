import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { formatCompact, SERIES_COLORS } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'

/**
 * SOT-943 / SOT-971: 上位N社の時価総額の年次推移を「企業別」の複数系列で表示する。
 * データは現在の時価総額 × 株価比率による近似（buildTopMarketCapCompanyYearly 参照）。
 */
export default function TopMarketCapChart({
  data,
  series,
}: {
  data: ({ year: number } & Record<string, number>)[]
  series: { key: string; name: string }[]
}) {
  const { t } = useI18n()
  if (!data || data.length === 0 || !series || series.length === 0)
    return <EmptyChart message={t('chart.empty.marketCap')} />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={52} tickFormatter={v => formatCompact(v)} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={(value, name) => [formatCompact(Number(value)), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
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
