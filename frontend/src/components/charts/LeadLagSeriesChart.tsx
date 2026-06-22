import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { useI18n } from '../../i18n/useI18n'

/** 論文件数と株価指数を初月=100に正規化し、月次で重ね描きする（リードラグの視覚確認用）。 */
export default function LeadLagSeriesChart({
  data,
}: {
  data: { ym: string; paper: number; stock: number }[]
}) {
  const { t } = useI18n()
  if (!data || data.length === 0) return <EmptyChart message={t('candidates.leadlag.noData')} />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="ym" tick={{ fontSize: 10 }} minTickGap={24} />
        <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={v => String(Math.round(Number(v)))} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={(value, name) => [value == null ? '' : Number(value).toFixed(1), String(name)]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="paper"
          name={t('candidates.leadlag.paperSeries')}
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="stock"
          name={t('candidates.leadlag.stockSeries')}
          stroke="#ef4444"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
