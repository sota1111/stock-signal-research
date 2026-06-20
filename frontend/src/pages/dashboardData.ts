import { useQuery, useQueries } from '@tanstack/react-query'
import { fetchDashboard, fetchStock } from '../api'
import type { Company } from '../types'
import type { StockItem } from '../components/charts/chartUtils'

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
