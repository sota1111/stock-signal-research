import { useQuery, useQueries } from '@tanstack/react-query'
import { fetchDashboard, fetchStock, fetchThemes, fetchFinancialFundamentals, fetchPatentYearly } from '../api'
import type { Company, Theme, FinancialFundamentals } from '../types'
import type { StockItem } from '../components/charts/chartUtils'
import { toYearly, yearOf, pctReturn, marketCapUsd } from '../components/charts/chartUtils'

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
 * 企業のタグ付けテーマ群から「最も多く属する大カテゴリ（dominant category）」を1つ返す。
 *
 * SOT-1127: 「いずれかのテーマが該当する大カテゴリ」すべてに企業を含めると、付随的にタグ付け
 * されたメガキャップ（例: NVIDIA / Alphabet）が本来の領域でない大カテゴリの上位を占有してしまう
 * （Biotech に NVIDIA/Alphabet が出る等）。各企業を代表する大カテゴリ1つに絞るための判定。
 * 同数タイは大カテゴリ名の昇順で決定的に解決する。該当する大カテゴリが無ければ null。
 */
function dominantCategory(company: Company, categoryByThemeId: Map<string, string>): string | null {
  if (!company.theme_ids) return null
  let ids: string[] = []
  try {
    const parsed = JSON.parse(company.theme_ids)
    if (Array.isArray(parsed)) ids = parsed.map(String)
  } catch {
    return null
  }
  const counts = new Map<string, number>()
  for (const id of ids) {
    const cat = categoryByThemeId.get(id)
    if (!cat) continue
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  // 大カテゴリ名の昇順で走査し、より多い件数のものだけ採用 → 同数タイは昇順先頭が残る（決定的）。
  for (const cat of [...counts.keys()].sort()) {
    const n = counts.get(cat) as number
    if (n > bestCount) {
      best = cat
      bestCount = n
    }
  }
  return best
}

/**
 * 注目企業を選択中の大カテゴリ（Theme.category）に絞り込む（SOT-1081 要件⑤ / SOT-1127）。
 *
 * 各 `Company.theme_ids`（theme_id 配列の JSON 文字列）を theme_id→category マップで大カテゴリに
 * 解決し、企業の代表（dominant）大カテゴリが選択中の大カテゴリと一致する企業のみ残す。
 * 付随的に別領域テーマへタグ付けされたメガキャップが無関係な大カテゴリの上位を占有するのを防ぐ。
 * `category` が空（全カテゴリ）の場合は全件をそのまま返す。
 */
export function filterCompaniesByCategory(companies: Company[], category: string, themes: Theme[]): Company[] {
  if (!category) return companies
  const categoryByThemeId = new Map<string, string>(
    themes.filter(th => th.id && th.category).map(th => [th.id, th.category]),
  )
  return companies.filter(c => dominantCategory(c, categoryByThemeId) === category)
}

/**
 * Shared per-ticker stock queries derived from the dashboard's notable companies.
 * Returns the ticker-bearing companies, their query results, the chart items and the
 * first successfully-loaded stock (used as the primary series in cross charts).
 */
export function useTickerStocks(companies: Company[], options?: { enabled?: boolean }) {
  // SOT-1128: enabled=false のときは per-ticker fetch を抑止する（クロス分析の
  // グローバル・フォールバックは「scoped 時価総額が空のとき」だけ取得するため）。
  const enabled = options?.enabled ?? true
  const tickerCompanies = companies.filter((c): c is Company & { ticker: string } => !!c.ticker)
  const stockQueries = useQueries({
    queries: tickerCompanies.map(c => ({
      queryKey: ['stock', c.ticker, STOCK_YEARS],
      queryFn: () => fetchStock(c.ticker, STOCK_YEARS),
      staleTime: STOCK_STALE_TIME,
      retry: 1,
      enabled,
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
    .sort((a, b) => (marketCapUsd(b.stock) ?? 0) - (marketCapUsd(a.stock) ?? 0))
    .slice(0, topN)

  const totals = new Map<number, number>()
  for (const it of eligible) {
    const yearly = toYearly(it.stock.prices)
    if (yearly.size === 0) continue
    const latestYear = Math.max(...yearly.keys())
    const closeLatest = yearly.get(latestYear)!
    if (!closeLatest) continue
    const mcapNow = marketCapUsd(it.stock)!
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
    .sort((a, b) => (marketCapUsd(b.stock) ?? 0) - (marketCapUsd(a.stock) ?? 0))
    .slice(0, topN)

  const series: { key: string; name: string }[] = []
  const byYear = new Map<number, { year: number } & Record<string, number>>()
  for (const it of eligible) {
    const yearly = toYearly(it.stock.prices)
    if (yearly.size === 0) continue
    const latestYear = Math.max(...yearly.keys())
    const closeLatest = yearly.get(latestYear)!
    if (!closeLatest) continue
    const mcapNow = marketCapUsd(it.stock)!
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

// ---------------------------------------------------------------------------
// 財務ファンダメンタルズ（SOT-1126 子1 / G1 研究→業績連鎖, G2 R&D集約度散布図）
// ---------------------------------------------------------------------------

const FUNDAMENTALS_STALE_TIME = 1000 * 60 * 30
// 1 カード分の per-ticker fetch 上限。カテゴリ未選択時に注目企業全件を引かないよう抑制する。
const FUNDAMENTALS_MAX_TICKERS = 12

export interface FundamentalsItem {
  ticker: string
  name: string
  data?: FinancialFundamentals
}

/**
 * 企業群（カテゴリ絞り込み済みの注目企業を想定）の財務ファンダメンタルズ時系列を per-ticker で取得する。
 * `useTickerStocks` と同じ流儀: hooks 数を一定に保つため常に呼び出し、`enabled` で fetch を制御する。
 * 取得対象は ticker を持つ企業の先頭 `max` 件に制限する（過剰 fetch 抑制）。
 */
export function useTickerFundamentals(
  companies: Company[],
  options?: { enabled?: boolean; max?: number },
) {
  const enabled = options?.enabled ?? true
  const max = options?.max ?? FUNDAMENTALS_MAX_TICKERS
  const tickerCompanies = companies
    .filter((c): c is Company & { ticker: string } => !!c.ticker)
    .slice(0, max)
  const queries = useQueries({
    queries: tickerCompanies.map(c => ({
      queryKey: ['financial-fundamentals', c.ticker],
      queryFn: () => fetchFinancialFundamentals(c.ticker),
      staleTime: FUNDAMENTALS_STALE_TIME,
      retry: 1,
      enabled,
    })),
  })
  const items: FundamentalsItem[] = tickerCompanies.map((c, i) => ({
    ticker: c.ticker,
    name: c.name,
    data: queries[i]?.data,
  }))
  return { tickerCompanies, queries, items }
}

export interface ResearchPerformancePoint {
  year: number
  revenue: number
  grossMarginPct: number | null
  rndRatioPct: number | null
}

/**
 * G1: 構成企業の財務時系列を年次で集計し「研究→業績」連鎖の系列を作る。
 * 売上=合計, 粗利率%=Σ粗利/Σ売上, R&D比率%=ΣR&D/Σ売上。GRAPH_FROM_YEAR(2009) 以降のみ。
 */
export function buildResearchPerformanceSeries(items: FundamentalsItem[]): ResearchPerformancePoint[] {
  const rev = new Map<number, number>()
  const gp = new Map<number, number>()
  const rnd = new Map<number, number>()
  for (const it of items) {
    const points = it.data?.points
    if (!points) continue
    for (const p of points) {
      const v = p.values ?? {}
      if (typeof v.revenue === 'number') rev.set(p.year, (rev.get(p.year) ?? 0) + v.revenue)
      if (typeof v.gross_profit === 'number') gp.set(p.year, (gp.get(p.year) ?? 0) + v.gross_profit)
      if (typeof v.rnd === 'number') rnd.set(p.year, (rnd.get(p.year) ?? 0) + v.rnd)
    }
  }
  const years = [...rev.keys()].filter(y => y >= GRAPH_FROM_YEAR).sort((a, b) => a - b)
  return years.map(y => {
    const r = rev.get(y) ?? 0
    const g = gp.get(y)
    const rd = rnd.get(y)
    return {
      year: y,
      revenue: r,
      grossMarginPct: g != null && r > 0 ? (g / r) * 100 : null,
      rndRatioPct: rd != null && r > 0 ? (rd / r) * 100 : null,
    }
  })
}

export interface RnDIntensityPoint {
  name: string
  rndRatio: number
  growth: number
  revenue: number
}

/**
 * G2: 企業ごとの R&D集約度 散布図ポイント。
 * X=R&D/売上比率(%), Y=時価総額成長率(株価騰落率%で近似), バブル径=売上規模。
 * 最新の「売上>0 かつ R&D あり」年を採用。株価系列が無い企業は除外。
 */
export function buildRnDIntensityPoints(
  items: FundamentalsItem[],
  stockItems: StockItem[],
): RnDIntensityPoint[] {
  const growthByTicker = new Map<string, number>()
  for (const si of stockItems) {
    if (si.stock && !si.stock.error && si.stock.prices.length > 1) {
      const g = pctReturn(si.stock.prices)
      if (g != null) growthByTicker.set(si.ticker, g)
    }
  }
  const out: RnDIntensityPoint[] = []
  for (const it of items) {
    const points = it.data?.points
    if (!points || points.length === 0) continue
    const sorted = [...points].sort((a, b) => b.year - a.year)
    const chosen = sorted.find(p => {
      const v = p.values ?? {}
      return typeof v.revenue === 'number' && v.revenue > 0 && typeof v.rnd === 'number'
    })
    if (!chosen) continue
    const v = chosen.values
    const growth = growthByTicker.get(it.ticker)
    if (growth == null) continue
    out.push({
      name: it.name,
      rndRatio: (v.rnd / v.revenue) * 100,
      growth,
      revenue: v.revenue,
    })
  }
  return out
}

/** ある銘柄の財務時系列から「最新年の R&D 費用」を取り出す（無ければ null）。G7 レーダーの財務軸で利用。 */
export function latestRnd(data?: FinancialFundamentals): number | null {
  const points = data?.points
  if (!points || points.length === 0) return null
  const sorted = [...points].sort((a, b) => b.year - a.year)
  for (const p of sorted) {
    const v = p.values ?? {}
    if (typeof v.rnd === 'number') return v.rnd
  }
  return null
}

// ---------------------------------------------------------------------------
// 特許（テーマ別件数）— G7 多面シグナル レーダーの特許軸（SOT-1126 子5）
// ---------------------------------------------------------------------------

const PATENT_STALE_TIME = 1000 * 60 * 30
const RADAR_COHORT_MAX = 15

/**
 * テーマ群の特許件数を per-theme で取得し theme_id→件数 の Map にする。
 * レーダーのカテゴリ内 max-scaling に使う（コホートは選択中の大カテゴリのテーマ）。
 */
export function useThemePatentCounts(themeIds: string[], options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  const ids = themeIds.slice(0, RADAR_COHORT_MAX)
  const queries = useQueries({
    queries: ids.map(id => ({
      queryKey: ['patent-yearly', id],
      queryFn: () => fetchPatentYearly(id),
      staleTime: PATENT_STALE_TIME,
      retry: 1,
      enabled,
    })),
  })
  const byThemeId = new Map<string, number>()
  ids.forEach((id, i) => {
    const rows = queries[i]?.data
    if (rows) byThemeId.set(id, rows.reduce((s, r) => s + (r.count ?? 0), 0))
  })
  return { byThemeId, queries }
}

export interface RadarMetric {
  label: string
  byThemeId: Map<string, number>
}

export interface RadarAxisPoint {
  axis: string
  value: number
}

/**
 * G7: 各シグナルをコホート（選択カテゴリ内テーマ）で max-scaling して 0–100 に正規化し、
 * 選択テーマの 5 軸レーダー点を返す。1 軸が支配しないよう軸ごとに独立正規化する。
 */
export function buildRadarAxes(
  metrics: RadarMetric[],
  cohortThemeIds: string[],
  selectedThemeId: string,
): RadarAxisPoint[] {
  return metrics.map(m => {
    let max = 0
    for (const id of cohortThemeIds) max = Math.max(max, m.byThemeId.get(id) ?? 0)
    const v = m.byThemeId.get(selectedThemeId) ?? 0
    return { axis: m.label, value: max > 0 ? Math.round((v / max) * 100) : 0 }
  })
}

/** 企業の theme_ids（JSON 文字列）を string[] にパースする。G7 の企業→テーマ按分で利用。 */
export function parseThemeIds(raw?: string): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
