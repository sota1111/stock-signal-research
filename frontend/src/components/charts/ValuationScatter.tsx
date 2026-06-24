import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { formatCompact, marketCapUsd, validStockItems, type StockItem } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'

interface Point {
  name: string
  pe: number
  cap: number
  yield: number
}

/** A4: バリュエーション散布図（横軸PER × 縦軸時価総額、バブル=配当利回り）。 */
export default function ValuationScatter({ items }: { items: StockItem[] }) {
  const { t } = useI18n()
  const valid = validStockItems(items)
  const data: Point[] = valid
    .map(item => {
      const f = item.stock.financials
      return {
        name: item.name,
        pe: f.trailing_pe ?? NaN,
        // 時価総額は銘柄ごとに現地通貨。USD換算して通貨を揃える（SOT-1207）。
        cap: marketCapUsd(item.stock) ?? NaN,
        yield: (f.dividend_yield ?? 0) * 100,
      }
    })
    .filter(p => Number.isFinite(p.pe) && Number.isFinite(p.cap) && p.pe > 0 && p.cap > 0)

  if (data.length === 0) return <EmptyChart message={t('chart.empty.valuation')} />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis type="number" dataKey="pe" name="PER" tick={{ fontSize: 11 }} label={{ value: 'PER', position: 'insideBottomRight', fontSize: 11, offset: -4 }} />
        <YAxis type="number" dataKey="cap" name={`${t('stock.marketCap')} (USD)`} tick={{ fontSize: 11 }} width={56} tickFormatter={v => formatCompact(v)} />
        <ZAxis type="number" dataKey="yield" range={[60, 400]} name={t('chart.dividendYield')} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={({ payload }) => {
            if (!payload || payload.length === 0) return null
            const p = payload[0].payload as Point
            return (
              <div className="bg-surface border rounded shadow px-2 py-1 text-xs">
                <p className="font-semibold">{p.name}</p>
                <p>PER {p.pe.toFixed(1)}</p>
                <p>{t('stock.marketCap')} {formatCompact(p.cap)} (USD)</p>
                <p>{t('chart.dividendYield')} {p.yield.toFixed(2)}%</p>
              </div>
            )
          }}
        />
        <Scatter data={data} fill="#3b82f6" fillOpacity={0.6} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
