import type { StockData, StockPricePoint } from '../../types'

export interface StockItem {
  name: string
  ticker: string
  stock?: StockData
}

/** 多系列チャート用のカラーパレット */
export const SERIES_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

export function yearOf(date: string): number {
  return Number(date.slice(0, 4))
}

function monthKey(date: string): string {
  return date.slice(0, 7) // YYYY-MM
}

/** 日次終値を月末（各月最後の値）にダウンサンプルする。描画負荷を抑えるため。 */
export function toMonthly(prices: StockPricePoint[]): { date: string; close: number }[] {
  const byMonth = new Map<string, number>()
  for (const p of prices) {
    byMonth.set(monthKey(p.date), p.close) // pricesは日付昇順想定 → 上書きで月末が残る
  }
  return Array.from(byMonth.entries()).map(([date, close]) => ({ date, close }))
}

/** 日次終値を年末（各年最後の値）にする。 */
export function toYearly(prices: StockPricePoint[]): Map<number, number> {
  const byYear = new Map<number, number>()
  for (const p of prices) {
    byYear.set(yearOf(p.date), p.close)
  }
  return byYear
}

/** 期間騰落率（%）。 */
export function pctReturn(prices: StockPricePoint[]): number | null {
  if (prices.length < 2) return null
  const first = prices[0].close
  const last = prices[prices.length - 1].close
  if (first === 0) return null
  return ((last - first) / first) * 100
}

/** 大きな数値を T/B/M で簡略表記する。 */
export function formatCompact(value?: number | null): string {
  if (value == null) return '-'
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
}

/** stock取得が有効（価格データあり）な item のみ返す。 */
export function validStockItems(items: StockItem[]): (StockItem & { stock: StockData })[] {
  return items.filter(
    (it): it is StockItem & { stock: StockData } =>
      !!it.stock && !it.stock.error && it.stock.prices.length > 0,
  )
}
