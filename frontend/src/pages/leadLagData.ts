import type { PaperMonthlyCount } from '../types'
import type { StockItem } from '../components/charts/chartUtils'
import { toMonthly } from '../components/charts/chartUtils'

/** リードラグ分析で評価するラグ（月数）。 */
export const LEAD_LAG_BUCKETS = [1, 3, 6, 12]

/** 論文増加率の算出方法: 前月比(MoM) / 前年比(YoY, 12か月前との比)。 */
export type GrowthMode = 'mom' | 'yoy'

export interface MonthlyPoint {
  ym: string // YYYY-MM
  value: number
}

export interface LeadLagResult {
  lag: number
  /** 論文増加(MoM)と lag か月先株価リターンの相関係数(-1..1)。データ不足時は null。 */
  corr: number | null
  /** 相関に使った標本数。 */
  n: number
}

/** PaperMonthlyCount[] を YYYY-MM ごとの件数合計（キーワード横断）に集約する。 */
export function aggregatePaperMonthly(rows: PaperMonthlyCount[]): MonthlyPoint[] {
  const byMonth = new Map<string, number>()
  for (const r of rows) {
    if (!r.year_month) continue
    byMonth.set(r.year_month, (byMonth.get(r.year_month) ?? 0) + r.count)
  }
  return [...byMonth.entries()]
    .map(([ym, value]) => ({ ym, value }))
    .sort((a, b) => a.ym.localeCompare(b.ym))
}

/**
 * 注目企業の株価から「マーケット指数」（月次）を組み立てる。
 *
 * テーマ別の株価系列は存在しないため、有効な各社の月末終値を初月=100に正規化し、
 * 月ごとに平均した合成指数を株価反応の代理として使う（リードラグ分析の近似）。
 */
export function buildMarketMonthlyIndex(stockItems: StockItem[]): MonthlyPoint[] {
  const sum = new Map<string, number>()
  const cnt = new Map<string, number>()
  for (const it of stockItems) {
    if (!it.stock || it.stock.error || it.stock.prices.length === 0) continue
    const monthly = toMonthly(it.stock.prices)
    if (monthly.length === 0) continue
    const base = monthly[0].close
    if (!base) continue
    for (const m of monthly) {
      const norm = (m.close / base) * 100
      const ym = m.date.slice(0, 7)
      sum.set(ym, (sum.get(ym) ?? 0) + norm)
      cnt.set(ym, (cnt.get(ym) ?? 0) + 1)
    }
  }
  return [...sum.entries()]
    .map(([ym, total]) => ({ ym, value: total / (cnt.get(ym) ?? 1) }))
    .sort((a, b) => a.ym.localeCompare(b.ym))
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  if (dx === 0 || dy === 0) return null
  return num / Math.sqrt(dx * dy)
}

/**
 * 論文増加(月次MoM)と株価の lag か月先リターンの相関を、各ラグについて算出する。
 * 共通の月（論文・株価の両方にデータがある月）を昇順に並べ、配列インデックスを
 * 1か月ステップとみなして lag を適用する（月次データ前提）。
 */
export function computeLeadLag(
  paperMonthly: MonthlyPoint[],
  stockMonthly: MonthlyPoint[],
  lags: number[] = LEAD_LAG_BUCKETS,
  growthMode: GrowthMode = 'mom',
): { results: LeadLagResult[]; bestLag: number | null } {
  const stockByYm = new Map(stockMonthly.map(p => [p.ym, p.value]))
  // 両系列にデータがある月のみ、昇順で採用する。
  const months = paperMonthly.filter(p => stockByYm.has(p.ym)).map(p => p.ym).sort((a, b) => a.localeCompare(b))
  const paperByYm = new Map(paperMonthly.map(p => [p.ym, p.value]))

  const paper = months.map(ym => paperByYm.get(ym)!)
  const stock = months.map(ym => stockByYm.get(ym)!)

  // 論文の成長率: 前月比(MoM, span=1) または 前年比(YoY, span=12)。
  const span = growthMode === 'yoy' ? 12 : 1
  const growth: number[] = []
  for (let i = span; i < paper.length; i++) {
    const prev = paper[i - span]
    growth[i] = prev > 0 ? (paper[i] - prev) / prev : 0
  }

  const results: LeadLagResult[] = lags.map(lag => {
    const xs: number[] = []
    const ys: number[] = []
    for (let i = span; i + lag < stock.length; i++) {
      const base = stock[i]
      if (!base || growth[i] === undefined) continue
      const fwd = (stock[i + lag] - base) / base
      xs.push(growth[i])
      ys.push(fwd)
    }
    return { lag, corr: pearson(xs, ys), n: xs.length }
  })

  let bestLag: number | null = null
  let bestAbs = -1
  for (const r of results) {
    if (r.corr != null && Math.abs(r.corr) > bestAbs) {
      bestAbs = Math.abs(r.corr)
      bestLag = r.lag
    }
  }
  return { results, bestLag }
}

/**
 * 論文件数と株価指数を初月=100に正規化し、月次の重ね描き用データへ整形する。
 * 共通月のみ返す。
 */
export function buildLeadLagSeries(
  paperMonthly: MonthlyPoint[],
  stockMonthly: MonthlyPoint[],
): { ym: string; paper: number; stock: number }[] {
  const stockByYm = new Map(stockMonthly.map(p => [p.ym, p.value]))
  const months = paperMonthly.filter(p => stockByYm.has(p.ym)).sort((a, b) => a.ym.localeCompare(b.ym))
  if (months.length === 0) return []
  const paperBase = months[0].value || 1
  const stockFirst = stockByYm.get(months[0].ym)!
  const stockBase = stockFirst || 1
  return months.map(p => ({
    ym: p.ym,
    paper: (p.value / paperBase) * 100,
    stock: (stockByYm.get(p.ym)! / stockBase) * 100,
  }))
}
