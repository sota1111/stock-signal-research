import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { PaperYearCount } from '../../types'
import { useI18n } from '../../i18n/useI18n'

/**
 * SOT-943: 年別の論文件数を単独の棒グラフで表示する。
 */
export default function PapersCountChart({ counts }: { counts: PaperYearCount[] }) {
  const { t } = useI18n()
  if (!counts || counts.length === 0) return <EmptyChart message={t('chart.empty.papers')} />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={counts} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={(value, name) => [t('chart.value.papers', { n: Number(value) }), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="count" name={t('chart.legend.paperCount')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
