import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { SERIES_COLORS } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'
import type { CategoryPaperCounts } from '../../types'

/**
 * SOT-1081 要件③④: 選択した大カテゴリ内の（小）カテゴリ＝テーマごとの年別論文数を
 * 折れ線で表示する。各テーマを1本の Line とする。`fromYear` / `toYear` で年範囲を絞る
 * （ダッシュボードの表示年レンジセレクタと連動）。
 */
export default function CategoryPaperCountsChart({
  data,
  fromYear,
  toYear,
}: {
  data: CategoryPaperCounts
  fromYear?: number | null
  toYear?: number | null
}) {
  const { t } = useI18n()
  const years = data?.years ?? []
  const series = data?.series ?? []
  if (years.length === 0 || series.length === 0)
    return <EmptyChart message={t('chart.papers.empty')} />

  // recharts は系列ごとに一意な dataKey が要る。テーマ名の重複に備え theme_id を優先キーにする。
  const keyed = series.map((s, i) => ({ key: s.theme_id ?? `${s.theme_name}-${i}`, name: s.theme_name, counts: s.counts }))

  const rows = years
    .map((year, idx) => {
      const row: { year: number } & Record<string, number> = { year }
      for (const s of keyed) row[s.key] = s.counts[idx] ?? 0
      return row
    })
    .filter(
      r =>
        (fromYear == null || r.year >= fromYear) &&
        (toYear == null || r.year <= toYear),
    )

  if (rows.length === 0) return <EmptyChart message={t('chart.papers.empty')} />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={44} allowDecimals={false} />
        <Tooltip labelStyle={{ fontSize: 12 }} formatter={(value, name) => [Number(value).toLocaleString(), name]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keyed.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
