import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { SERIES_COLORS } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'
import type { CategoryPaperAverages } from '../../types'

/**
 * SOT-1049: カテゴリグループ（Theme.category / ドメイン）別の「テーマあたり平均論文数」を
 * 年次で表示する折れ線グラフ。各カテゴリを1本の Line とし、テーマ数の多寡に依らず
 * 「論文数が増えたか」をカテゴリ間で比較できるようにする。
 *
 * `fromYear` / `toYear` が指定された場合は、その年範囲に絞って表示する（ダッシュボードの
 * 表示年レンジセレクタと連動させるため）。
 */
export default function CategoryAvgPapersChart({
  data,
  fromYear,
  toYear,
}: {
  data: CategoryPaperAverages
  fromYear?: number | null
  toYear?: number | null
}) {
  const { t } = useI18n()
  const years = data?.years ?? []
  const categories = data?.categories ?? []
  if (years.length === 0 || categories.length === 0)
    return <EmptyChart message={t('chart.categoryAvg.empty')} />

  // 年×カテゴリの recharts 行データに変換する。年範囲が指定されていれば絞り込む。
  const rows = years
    .map((year, idx) => {
      const row: { year: number } & Record<string, number> = { year }
      for (const c of categories) {
        row[c.category] = c.averages[idx] ?? 0
      }
      return row
    })
    .filter(
      r =>
        (fromYear == null || r.year >= fromYear) &&
        (toYear == null || r.year <= toYear),
    )

  if (rows.length === 0) return <EmptyChart message={t('chart.categoryAvg.empty')} />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={44} allowDecimals />
        <Tooltip labelStyle={{ fontSize: 12 }} formatter={(value, name) => [Number(value).toFixed(2), name]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {categories.map((c, i) => (
          <Line
            key={c.category}
            type="monotone"
            dataKey={c.category}
            name={c.category}
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
