import { useQuery, useQueries } from '@tanstack/react-query'
import { fetchDashboard, fetchStock } from '../api'
import type { Company } from '../types'
import type { StockItem } from '../components/charts/chartUtils'
import { toYearly } from '../components/charts/chartUtils'

const STOCK_STALE_TIME = 1000 * 60 * 30

export function formatPrice(value: number, currency?: string | null) {
  const symbol = currency === 'JPY' ? '¥' : currency === 'USD' ? '$' : ''
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${symbol ? '' : ` ${currency ?? ''}`.trimEnd()}`
}

export function formatMarketCap(value?: number | null) {
  if (value == null) return '-'
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  return value.toLocaleString()
}

/** Shared dashboard data query (notable companies, trending themes, supply chain, keywords). */
export function useDashboardQuery() {
  return useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
}

/**
 * Shared per-ticker stock queries derived from the dashboard's notable companies.
 * Returns the ticker-bearing companies, their query results, the chart items and the
 * first successfully-loaded stock (used as the primary series in cross charts).
 */
export function useTickerStocks(companies: Company[]) {
  const tickerCompanies = companies.filter((c): c is Company & { ticker: string } => !!c.ticker)
  const stockQueries = useQueries({
    queries: tickerCompanies.map(c => ({
      queryKey: ['stock', c.ticker, 10],
      queryFn: () => fetchStock(c.ticker, 10),
      staleTime: STOCK_STALE_TIME,
      retry: 1,
    })),
  })
  const stockItems: StockItem[] = tickerCompanies.map((c, i) => ({
    name: c.name,
    ticker: c.ticker,
    stock: stockQueries[i]?.data,
  }))
  const primaryStock = stockItems.find(it => it.stock && !it.stock.error && it.stock.prices.length > 0)
  return { tickerCompanies, stockQueries, stockItems, primaryStock }
}

/**
 * 上位N社の時価総額合計の年次推移を組み立てる。
 *
 * 注意: yfinance には時価総額の時系列が無いため、近似を使う。
 * shares はほぼ一定とみなし `mcapAtYear = market_cap_now × (closeAtYear / closeLatest)`
 * （= 現在の時価総額を株価の比率でスケール）で各社の年次時価総額を推定し、
 * 上位N社（現在の market_cap 降順）について年ごとに合計する。
 */
export function buildTopMarketCapYearly(
  stockItems: StockItem[],
  topN = 10,
): { year: number; total: number }[] {
  const eligible = stockItems
    .filter(
      (it): it is StockItem & { stock: NonNullable<StockItem['stock']> } =>
        !!it.stock &&
        !it.stock.error &&
        it.stock.prices.length > 0 &&
        it.stock.financials.market_cap != null,
    )
    .sort((a, b) => (b.stock.financials.market_cap ?? 0) - (a.stock.financials.market_cap ?? 0))
    .slice(0, topN)

  const totals = new Map<number, number>()
  for (const it of eligible) {
    const yearly = toYearly(it.stock.prices)
    if (yearly.size === 0) continue
    const latestYear = Math.max(...yearly.keys())
    const closeLatest = yearly.get(latestYear)!
    if (!closeLatest) continue
    const mcapNow = it.stock.financials.market_cap!
    for (const [year, close] of yearly) {
      const mcap = mcapNow * (close / closeLatest)
      totals.set(year, (totals.get(year) ?? 0) + mcap)
    }
  }

  return [...totals.entries()]
    .map(([year, total]) => ({ year, total }))
    .sort((a, b) => a.year - b.year)
}
