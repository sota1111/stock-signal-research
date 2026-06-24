import type { StockData, StockPricePoint } from '../../types'

export interface StockItem {
  name: string
  ticker: string
  stock?: StockData
}

/** 多系列チャート用のカラーパレット */
export const SERIES_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']

/** SOT-1239: 集約スライス/系列「その他」を表す色キー。 */
export const OTHERS_KEY = '__others__'

/** その他/未指定の中立グレー（円グラフ・線グラフ共通）。 */
const OTHERS_COLOR = '#94a3b8'

/**
 * SOT-1239: 投資対象(ticker/企業名)を一貫した色で表す。
 * 全投資家の円グラフ・線グラフで「同じ投資対象=同じ色」にし、AMDは常に赤・NVIDIAは常に緑のように、
 * 投資家を跨いでも同一銘柄が同じ色になるようにする。
 */
const HOLDING_COLOR_OVERRIDES: Record<string, string> = {
  amd: '#ef4444', // 赤
  nvda: '#10b981', // 緑
  nvidia: '#10b981', // 緑（社名表記ゆれ対応）
  [OTHERS_KEY]: OTHERS_COLOR,
}

/**
 * override に無い投資対象は、キーのハッシュからこのパレットへ安定割当する。
 * AMD(#ef4444)/NVIDIA(#10b981) と被らないよう、それらの色は含めない。
 */
const HOLDING_PALETTE = [
  '#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6',
  '#f97316', '#6366f1', '#84cc16', '#eab308', '#a855f7', '#0ea5e9',
  '#d946ef', '#22d3ee', '#fb7185', '#65a30d',
]

/**
 * 投資対象(ticker または企業名)の描画色を返す（SOT-1239）。
 * override(AMD/NVIDIA/その他)を優先し、それ以外はキーの安定ハッシュでパレットから決定論的に割り当てる。
 * 同じキーは常に同じ色になるため、複数の円グラフ/線グラフで色が一致する。
 */
export function holdingColor(key: string): string {
  const k = (key ?? '').trim().toLowerCase()
  if (!k) return OTHERS_COLOR
  if (HOLDING_COLOR_OVERRIDES[k]) return HOLDING_COLOR_OVERRIDES[k]
  let h = 0
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0
  return HOLDING_PALETTE[h % HOLDING_PALETTE.length]
}

/** SOT-1142: サプライチェーンの relation_type を一貫した色で表す（Sankey/スイムレーン/凡例で共有）。 */
export const RELATION_COLORS: Record<string, string> = {
  supplies: '#3b82f6',
  enables: '#10b981',
  depends_on: '#f59e0b',
  complements: '#8b5cf6',
  competes: '#ef4444',
}

export const RELATION_TYPES = ['supplies', 'enables', 'depends_on', 'complements', 'competes'] as const

/** relation_type の描画色（未知は中立グレー）。 */
export const relationColor = (rt: string): string => RELATION_COLORS[rt] ?? '#94a3b8'

/** confidence(0..1) を線幅にマッピングする（最小でも視認できる太さを確保）。 */
export const confidenceStroke = (confidence: number): number => 1.2 + Math.max(0, Math.min(1, confidence ?? 0)) * 6

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

/**
 * 時価総額のクロス通貨比較用 静的FXテーブル（1単位通貨 = ? USD・2026-06スナップショット近似 / SOT-1207）。
 * backend の非米国USD換算近似（SOT-1122, market-cap-history-nonus.json）と整合する近似値。
 */
const FX_TO_USD: Record<string, number> = { USD: 1, JPY: 1 / 155, KRW: 1 / 1360 }

/**
 * 時価総額(market_cap)を USD 換算して返す（SOT-1207）。
 *
 * stock-prices.json の market_cap は銘柄ごとの現地通貨(USD/JPY/KRW)で格納されているため、
 * 散布図や時価総額系列で銘柄を跨いで比較する際は USD に揃える必要がある。
 * market_cap が無効、または有限でない場合は null。未知通貨/未設定は USD とみなす（rate=1）。
 */
export function marketCapUsd(stock: StockData): number | null {
  const mcap = stock.financials?.market_cap
  if (mcap == null || !Number.isFinite(mcap)) return null
  const rate = FX_TO_USD[(stock.currency ?? '').toUpperCase()] ?? 1
  return mcap * rate
}

/** stock取得が有効（価格データあり）な item のみ返す。 */
export function validStockItems(items: StockItem[]): (StockItem & { stock: StockData })[] {
  return items.filter(
    (it): it is StockItem & { stock: StockData } =>
      !!it.stock && !it.stock.error && it.stock.prices.length > 0,
  )
}
