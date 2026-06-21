import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { PaperYearCount } from '../../types'
import { useI18n } from '../../i18n/useI18n'

/**
 * 特許×論文 トレンド重ね合わせ（SOT-995 提案 /patents-1）。
 * 特許件数を棒（左軸）、論文件数を線（右軸）で同一年次に重ねて描画する。
 */
export default function PatentsVsPapersComposed({
  patents,
  papers,
}: {
  patents: { year: string; count: number }[]
  papers: PaperYearCount[]
}) {
  const { t } = useI18n()
  const patentsLegend = t('patents.chart.legend')

  if ((!patents || patents.length === 0) && (!papers || papers.length === 0)) {
    return <EmptyChart message={t('patents.overlay.empty')} />
  }

  const byYear = new Map<string, { year: string; patents: number | null; papers: number | null }>()
  for (const p of patents) {
    const row = byYear.get(p.year) ?? { year: p.year, patents: null, papers: null }
    row.patents = (row.patents ?? 0) + (p.count || 0)
    byYear.set(p.year, row)
  }
  for (const p of papers) {
    const y = String(p.year)
    const row = byYear.get(y) ?? { year: y, patents: null, papers: null }
    row.papers = (row.papers ?? 0) + (p.count || 0)
    byYear.set(y, row)
  }
  const data = [...byYear.values()].sort((a, b) => a.year.localeCompare(b.year))

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <Tooltip labelStyle={{ fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="patents" name={patentsLegend} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="papers"
          name={t('patents.overlay.papersLegend')}
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
