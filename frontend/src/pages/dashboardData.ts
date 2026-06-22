import { useQuery, useQueries } from '@tanstack/react-query'
import { fetchDashboard, fetchStock, fetchThemes } from '../api'
import type { Company } from '../types'
import type { StockItem } from '../components/charts/chartUtils'
import { toYearly, yearOf } from '../components/charts/chartUtils'

// SOT-1069: 全グラフ・年セレクタの可視下限を 2009 年に統一する共有定数。
// 実時価総額(SOT-1056)が2009起点であるのに合わせ、論文/特許/株価のグラフ起点もここに揃える。
// 生データやバックエンドのコレクションは変更せず、UI/取得パラメータのフロアとしてのみ使う。
export const GRAPH_FROM_YEAR = 2009

const STOCK_STALE_TIME = 1000 * 60 * 30
// SOT-1069: 株価グラフは GRAPH_FROM_YEAR(2009) 起点で表示する。backend /api/dashboard/stock は
// 相対 years(<=30) で受け取るため、2009 から現在までを覆う年数を動的に算出する（年が進んでもドリフトしない）。
const STOCK_YEARS = Math.min(30, new Date().getFullYear() - GRAPH_FROM_YEAR + 1)

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
 * 全テーマ一覧クエリ（SOT-1088）。
 * ダッシュボードの大カテゴリ／テーマ選択肢は従来 `/dashboard/` の top30 `trending_themes`
 * 由来で選択肢が不足していた。`/themes/` 全件を選択肢のユニバースに使い、全大カテゴリ・
 * 全テーマを選べるようにする。`trending_themes` は既定の並び順/初期テーマ選択に使う。
 */
export function useAllThemes() {
  return useQuery({ queryKey: ['themes-all'], queryFn: fetchThemes, staleTime: 1000 * 60 * 30 })
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
      queryKey: ['stock', c.ticker, STOCK_YEARS],
      queryFn: () => fetchStock(c.ticker, STOCK_YEARS),
      staleTime: STOCK_STALE_TIME,
      retry: 1,
    })),
  })
  // SOT-1069: 取得した日次終値を GRAPH_FROM_YEAR(2009) 以降に絞る。これにより本フック由来の
  // 全グラフ（dashboard 時価総額・/stock 概観・/papers 株価オーバーレイ）が一括で2009起点になる。
  const stockItems: StockItem[] = tickerCompanies.map((c, i) => {
    const raw = stockQueries[i]?.data
    const stock =
      raw && !raw.error && Array.isArray(raw.prices)
        ? { ...raw, prices: raw.prices.filter(p => yearOf(p.date) >= GRAPH_FROM_YEAR) }
        : raw
    return { name: c.name, ticker: c.ticker, stock }
  })
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

/**
 * 上位N社の時価総額を「企業別」に年次で組み立てる（SOT-971）。
 *
 * `buildTopMarketCapYearly` と同じ近似・eligibility・ソート・top-N を使うが、
 * 合計せず企業ごとの系列として返す。data は wide 形式（year 行 × ticker 列）、
 * series は描画順（時価総額降順）の凡例メタデータ。
 */
export function buildTopMarketCapCompanyYearly(
  stockItems: StockItem[],
  topN = 10,
): { data: ({ year: number } & Record<string, number>)[]; series: { key: string; name: string }[] } {
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

  const series: { key: string; name: string }[] = []
  const byYear = new Map<number, { year: number } & Record<string, number>>()
  for (const it of eligible) {
    const yearly = toYearly(it.stock.prices)
    if (yearly.size === 0) continue
    const latestYear = Math.max(...yearly.keys())
    const closeLatest = yearly.get(latestYear)!
    if (!closeLatest) continue
    const mcapNow = it.stock.financials.market_cap!
    series.push({ key: it.ticker, name: it.name })
    for (const [year, close] of yearly) {
      const row = byYear.get(year) ?? ({ year } as { year: number } & Record<string, number>)
      row[it.ticker] = mcapNow * (close / closeLatest)
      byYear.set(year, row)
    }
  }

  const data = [...byYear.values()].sort((a, b) => a.year - b.year)
  return { data, series }
}
