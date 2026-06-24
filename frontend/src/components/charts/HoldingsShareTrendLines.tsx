import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { holdingColor, OTHERS_KEY } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'
import type { InstitutionalInvestor } from '../../types'

const TOP_N = 8

/**
 * 1投資家分の「投資対象ごとの構成比(%)の推移」（SOT-1239）。
 * 渡された rows（=1投資家分）について、各 report_date でその投資家の保有額合計に占める
 * 各銘柄(ticker)のシェア(%)を求め、投資対象ごとに1本の折れ線として描画する。
 * 上位 TOP_N 銘柄 + 「その他」(残りシェア合算)に集約して見やすくする。
 * 色は holdingColor で銘柄ごとに固定するため、円グラフ(InvestorHoldingsPie)と色が一致する。
 * SOT-1187 の保有額合計1本線(HoldingsValueTrendLines)に代わり、投資家ページで使用する。
 */
export default function HoldingsShareTrendLines({ rows }: { rows: InstitutionalInvestor[] }) {
  const { t } = useI18n()
  const value = (r: InstitutionalInvestor) => r.value_usd ?? 0
  const holdingKey = (r: InstitutionalInvestor) => r.ticker ?? r.company_name ?? r.company_id
  const holdingLabel = (r: InstitutionalInvestor) => r.company_name ?? r.ticker ?? r.company_id

  const dates = [...new Set(rows.map(r => r.report_date))].sort()
  if (dates.length < 2) return <EmptyChart />

  // 銘柄ごとの (色キー, 表示ラベル) と、各報告日の保有額を集計する。
  const colorKeyByHolding = new Map<string, string>()
  const labelByHolding = new Map<string, string>()
  const valueByHoldingDate = new Map<string, Map<string, number>>()
  const totalByDate = new Map<string, number>()
  for (const d of dates) totalByDate.set(d, 0)

  for (const r of rows) {
    if (!totalByDate.has(r.report_date)) continue
    const key = holdingKey(r)
    if (!colorKeyByHolding.has(key)) {
      colorKeyByHolding.set(key, r.ticker ?? key)
      labelByHolding.set(key, holdingLabel(r))
    }
    const perDate = valueByHoldingDate.get(key) ?? new Map<string, number>()
    perDate.set(r.report_date, (perDate.get(r.report_date) ?? 0) + value(r))
    valueByHoldingDate.set(key, perDate)
    totalByDate.set(r.report_date, (totalByDate.get(r.report_date) ?? 0) + value(r))
  }

  // 各銘柄の (date → シェア%) を計算する。
  const shareByHolding = new Map<string, Map<string, number>>()
  for (const [key, perDate] of valueByHoldingDate) {
    const shares = new Map<string, number>()
    for (const d of dates) {
      const total = totalByDate.get(d) ?? 0
      shares.set(d, total > 0 ? ((perDate.get(d) ?? 0) / total) * 100 : 0)
    }
    shareByHolding.set(key, shares)
  }

  // 最新報告日のシェア降順で上位 TOP_N を採用し、残りは「その他」に合算する。
  const latest = dates[dates.length - 1]
  const ranked = [...shareByHolding.entries()].sort(
    (a, b) => (b[1].get(latest) ?? 0) - (a[1].get(latest) ?? 0),
  )
  const topKeys = ranked.slice(0, TOP_N).map(([key]) => key)
  const restKeys = ranked.slice(TOP_N).map(([key]) => key)

  // dataKey 衝突を避けるため、表示ラベルが重複したら ticker を付与する。
  const seenLabels = new Map<string, number>()
  const series = topKeys.map(key => {
    let label = labelByHolding.get(key) ?? key
    const count = seenLabels.get(label) ?? 0
    seenLabels.set(label, count + 1)
    if (count > 0) label = `${label} (${colorKeyByHolding.get(key) ?? key})`
    return { key, label, colorKey: colorKeyByHolding.get(key) ?? key }
  })

  const othersLabel = t('investors.concentration.others')
  const hasOthers = restKeys.length > 0

  // recharts 用の行データ（date と各系列ラベルのシェア）を組み立てる。
  const data = dates.map(d => {
    const row: Record<string, number | string> = { date: d }
    for (const s of series) row[s.label] = shareByHolding.get(s.key)?.get(d) ?? 0
    if (hasOthers) {
      row[othersLabel] = restKeys.reduce((sum, key) => sum + (shareByHolding.get(key)?.get(d) ?? 0), 0)
    }
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={v => `${v}%`} />
        <Tooltip labelStyle={{ fontSize: 12 }} formatter={v => `${Number(v).toFixed(1)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map(s => (
          <Line
            key={s.label}
            type="monotone"
            dataKey={s.label}
            stroke={holdingColor(s.colorKey)}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        ))}
        {hasOthers && (
          <Line
            key={othersLabel}
            type="monotone"
            dataKey={othersLabel}
            stroke={holdingColor(OTHERS_KEY)}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
