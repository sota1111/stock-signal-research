import type { PaperMonthlyCount } from '../types'

// SOT-1159: TS port of backend/app/services/scoring.py `calculate_precursor_score`.
// The frontend needs not only the final score but the加点内訳 (point breakdown) so the
// SignalDetectionPage overlay can show *which* part of the monthly series triggered the
// precursor judgment. Keep the thresholds in sync with scoring.py.

export interface PrecursorSeriesPoint {
  year_month: string
  count: number
  /** Month-over-month change (%) vs the previous aggregated month. null when undefined. */
  mom: number | null
}

export interface PrecursorBreakdown {
  /** Final precursor score (capped at 100), mirroring calculate_precursor_score. */
  total: number
  /** Points from the latest month's MoM growth (0 / 10 / 25 / 40). */
  momPoints: number
  /** Latest month's MoM% (null when not computable). */
  momPct: number | null
  /** Points from the strictly-increasing 3-month streak (0 or 20). */
  streakPoints: number
  /** The year_month labels of the streak window when the bonus applies (else empty). */
  streakMonths: string[]
  /** The latest month label (the MoM marker anchor), or null when no data. */
  latestMonth: string | null
}

/**
 * Aggregate raw monthly rows (which may have several keyword rows per month) into a single
 * ascending series, summing `count` per `year_month`, and recomputing MoM% from the aggregate
 * so the breakdown faithfully mirrors the backend score.
 */
export function aggregateMonthly(rows: PaperMonthlyCount[]): PrecursorSeriesPoint[] {
  if (!rows || rows.length === 0) return []

  const byMonth = new Map<string, number>()
  for (const row of rows) {
    byMonth.set(row.year_month, (byMonth.get(row.year_month) ?? 0) + row.count)
  }

  const sorted = Array.from(byMonth.entries())
    .map(([year_month, count]) => ({ year_month, count }))
    .sort((a, b) => a.year_month.localeCompare(b.year_month))

  return sorted.map((point, i) => {
    if (i === 0) return { ...point, mom: null }
    const prev = sorted[i - 1].count
    const mom = prev > 0 ? ((point.count - prev) / prev) * 100 : null
    return { ...point, mom }
  })
}

/**
 * Compute the precursor score breakdown from an aggregated series.
 * Mirrors calculate_precursor_score:
 *   latest MoM% > 50 → +40, > 20 → +25, > 0 → +10
 *   strictly-increasing last 3 months → +20
 *   total capped at 100
 */
export function computePrecursorBreakdown(series: PrecursorSeriesPoint[]): PrecursorBreakdown {
  if (!series || series.length === 0) {
    return { total: 0, momPoints: 0, momPct: null, streakPoints: 0, streakMonths: [], latestMonth: null }
  }

  const latest = series[series.length - 1]
  const momPct = latest.mom
  let momPoints = 0
  if (momPct !== null) {
    if (momPct > 50) momPoints = 40
    else if (momPct > 20) momPoints = 25
    else if (momPct > 0) momPoints = 10
  }

  let streakPoints = 0
  let streakMonths: string[] = []
  if (series.length >= 3) {
    const last3 = series.slice(-3)
    const strictlyIncreasing = last3[1].count > last3[0].count && last3[2].count > last3[1].count
    if (strictlyIncreasing) {
      streakPoints = 20
      streakMonths = last3.map(p => p.year_month)
    }
  }

  const total = Math.min(momPoints + streakPoints, 100)
  return { total, momPoints, momPct, streakPoints, streakMonths, latestMonth: latest.year_month }
}

/**
 * SOT-1161 (案C): the trailing strictly-increasing run length of the aggregated series.
 * Unlike computePrecursorBreakdown's streak (capped at the last 3 months), this counts how many
 * consecutive months at the end of the series kept rising vs the previous month — used as the
 * momentum-scatter Y axis「連続増加月数」. Returns 0 for a series shorter than 2 points.
 */
export function trailingIncreasingMonths(series: PrecursorSeriesPoint[]): number {
  if (!series || series.length < 2) return 0
  let run = 0
  for (let i = series.length - 1; i > 0; i--) {
    if (series[i].count > series[i - 1].count) run++
    else break
  }
  return run
}

export interface SignalEvent {
  year_month: string
  count: number
  /** MoM% at the firing month (null when not computable). */
  mom: number | null
  /** True when MoM% > 20 at this month. */
  momFired: boolean
  /** True when this month closes a strictly-increasing 3-month run (m-2 < m-1 < m). */
  streakFired: boolean
  /** Follow-up counts for up to the next 3 months after the firing month. */
  followUp: { year_month: string; count: number }[]
  /** Count change from the firing month to the last available follow-up month (null when no follow-up). */
  followUpDelta: number | null
  /** Percent change firing→last follow-up month (null when firing count is 0 or no follow-up). */
  followUpPct: number | null
}

/**
 * SOT-1162 (案D): walk the aggregated monthly series and emit a SignalEvent for every month that
 * "fires": MoM% > 20 OR it closes a strictly-increasing 3-month run. For each firing month, capture
 * the next up-to-3 months as follow-up so the UI can show 前兆→その後 (post-firing trajectory).
 * Returns [] for an empty/short series. Pure; no side effects.
 *
 * The MoM>20 threshold is kept consistent with computePrecursorBreakdown's +25 tier (momPct > 20).
 */
export function detectSignalEvents(series: PrecursorSeriesPoint[]): SignalEvent[] {
  if (!series || series.length === 0) return []

  const events: SignalEvent[] = []
  for (let i = 0; i < series.length; i++) {
    const point = series[i]
    const mom = point.mom
    const momFired = mom !== null && mom > 20
    const streakFired =
      i >= 2 && series[i].count > series[i - 1].count && series[i - 1].count > series[i - 2].count
    if (!momFired && !streakFired) continue

    const followUp = series
      .slice(i + 1, i + 4)
      .map(p => ({ year_month: p.year_month, count: p.count }))
    const last = followUp[followUp.length - 1]
    const followUpDelta = last ? last.count - point.count : null
    const followUpPct =
      last && point.count > 0 ? ((last.count - point.count) / point.count) * 100 : null

    events.push({
      year_month: point.year_month,
      count: point.count,
      mom,
      momFired,
      streakFired,
      followUp,
      followUpDelta,
      followUpPct,
    })
  }
  return events
}
