import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { toYearly, formatCompact } from './chartUtils'
import type { PaperYearCount, StockData } from '../../types'
import { useI18n } from '../../i18n/useI18n'

/** C1: 年別論文件数（棒・左軸）と株価年末終値（線・右軸）の2軸時系列。 */
export default function PapersVsPriceComposed({
  counts,
  stock,
  companyName,
}: {
  counts: PaperYearCount[]
  stock?: StockData
  companyName?: string
}) {
  const { t } = useI18n()
  const priceLabel = t('chart.legend.priceYearEnd')
  if (!counts || counts.length === 0) return <EmptyChart message={t('chart.empty.papers')} />

  const yearly = stock && !stock.error ? toYearly(stock.prices) : new Map<number, number>()
  const hasPrice = yearly.size > 0
  const data = counts.map(c => ({
    year: c.year,
    count: c.count,
    close: yearly.has(c.year) ? yearly.get(c.year)! : null,
  }))

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="left" tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} width={52} tickFormatter={v => formatCompact(v)} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={(value, name) =>
            String(name).startsWith(priceLabel) ? [formatCompact(Number(value)), name] : [t('chart.value.papers', { n: Number(value) }), name]
          }
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="count" name={t('chart.legend.paperCount')} fill="#3b82f6" radius={[4, 4, 0, 0]} />
        {hasPrice && (
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="close"
            name={`${priceLabel}${companyName ? ` ${companyName}` : ''}`}
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
