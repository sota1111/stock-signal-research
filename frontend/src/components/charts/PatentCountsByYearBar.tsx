import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { useI18n } from '../../i18n/useI18n'

/** SOT-960: テーマ×年の特許マッチ件数(PPUBS numResults)を年次の棒グラフで表示する。 */
export default function PatentCountsByYearBar({ data }: { data: { year: string; count: number }[] }) {
  const { t } = useI18n()
  if (!data || data.length === 0) return <EmptyChart message={t('patents.chart.empty')} />

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={48} allowDecimals={false} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={value => [t('patents.chart.value', { n: Number(value) }), t('patents.chart.legend')]}
        />
        <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
