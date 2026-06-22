import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import type { PaperYearCount } from '../../types'
import { useI18n } from '../../i18n/useI18n'

/**
 * SOT-943: クロス分析。論文件数と上位N社時価総額合計をそれぞれ基準年=100で正規化し、
 * 2本の指数線として重ねて相関を可視化する。論文件数だけにならないよう、両系列が共通基準年で
 * 揃わない場合は EmptyChart を表示する。
 */
export default function PapersMarketCapCrossChart({
  counts,
  marketCap,
  baseYear,
}: {
  counts: PaperYearCount[]
  marketCap: { year: number; total: number }[]
  // SOT-1014: 指数の基準年。未指定/無効な年のときは自動（両系列が正の最初の共通年）にフォールバック。
  baseYear?: number
}) {
  const { t } = useI18n()
  const paperByYear = new Map<number, number>(counts.map(c => [c.year, c.count]))
  const mcapByYear = new Map<number, number>(marketCap.map(m => [m.year, m.total]))

  // 論文件数・時価総額がともに正となる最初の共通年を自動基準にする（SOT-1014: 指定があればそれを優先）
  const years = [...new Set([...paperByYear.keys(), ...mcapByYear.keys()])].sort((a, b) => a - b)
  const autoBaseYear = years.find(y => (paperByYear.get(y) ?? 0) > 0 && (mcapByYear.get(y) ?? 0) > 0)
  const isValidBase = (y?: number) =>
    y != null && (paperByYear.get(y) ?? 0) > 0 && (mcapByYear.get(y) ?? 0) > 0
  const effectiveBaseYear = isValidBase(baseYear) ? baseYear! : autoBaseYear

  if (effectiveBaseYear == null) {
    return <EmptyChart message={t('chart.empty.cross')} />
  }

  const basePaper = paperByYear.get(effectiveBaseYear)!
  const baseMcap = mcapByYear.get(effectiveBaseYear)!

  const data = years.map(year => {
    const paper = paperByYear.get(year)
    const mcap = mcapByYear.get(year)
    return {
      year,
      paperIdx: paper != null && paper > 0 ? (paper / basePaper) * 100 : null,
      mcapIdx: mcap != null && mcap > 0 ? (mcap / baseMcap) * 100 : null,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={v => `${v}`} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={(value, name) => [value == null ? '-' : Number(value).toFixed(0), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="paperIdx"
          name={t('chart.legend.paperIndex', { year: effectiveBaseYear })}
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="mcapIdx"
          name={t('chart.legend.mcapIndex', { year: effectiveBaseYear })}
          stroke="#8b5cf6"
          strokeWidth={2}
          strokeDasharray="5 3"
          dot={{ r: 2 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
