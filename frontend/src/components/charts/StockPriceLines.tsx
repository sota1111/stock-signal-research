import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { toMonthly, formatCompact, validStockItems, type StockItem } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'

/** A1: 注目企業ごとの終値推移（小チャートのグリッド・月末ダウンサンプル）。 */
export default function StockPriceLines({ items }: { items: StockItem[] }) {
  const { t } = useI18n()
  const valid = validStockItems(items)
  if (valid.length === 0) return <EmptyChart message={t('chart.empty.stock')} />

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {valid.map(item => {
        const data = toMonthly(item.stock.prices)
        return (
          <div key={item.ticker} className="bg-white rounded-lg shadow p-3">
            <div className="flex justify-between items-baseline mb-2">
              <p className="text-sm font-semibold text-gray-800">{item.name}</p>
              <span className="text-xs text-gray-400">{item.ticker}</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} tickFormatter={d => String(d).slice(0, 4)} />
                <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={v => formatCompact(v)} />
                <Tooltip formatter={value => formatCompact(Number(value))} labelStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="close" stroke="#10b981" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      })}
    </div>
  )
}
