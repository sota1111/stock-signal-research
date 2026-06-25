import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { holdingColor, OTHERS_KEY } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'

const TOP_N = 8

/**
 * 投資家ごとの保有内訳を円グラフで表示する（SOT-1146）。
 * スライス = その投資家が（最新報告で）保有する企業、重み = 保有額(value)。
 * 全体に対するシェア(%)を label / Tooltip に表示する。
 * 企業数が多い投資家は上位 TOP_N 社 + 「その他」に集約して見やすくする。
 */
export default function InvestorHoldingsPie({
  data,
}: {
  data: { company: string; colorKey: string; value: number }[]
}) {
  const { t } = useI18n()

  const positive = data.filter(d => d.value > 0)
  if (positive.length === 0) return <EmptyChart />

  // value 降順にソートし、上位 TOP_N + その他に集約する。
  const sorted = positive.slice().sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, TOP_N)
  const rest = sorted.slice(TOP_N)
  const restTotal = rest.reduce((sum, d) => sum + d.value, 0)
  const slices = restTotal > 0
    ? [...top, { company: t('investors.concentration.others'), colorKey: OTHERS_KEY, value: restTotal }]
    : top

  const total = slices.reduce((sum, d) => sum + d.value, 0)
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)

  return (
    <ResponsiveContainer width="100%" height={360}>
      <PieChart margin={{ top: 24, right: 8, bottom: 8, left: 8 }}>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="company"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={entry => `${entry.name} ${pct(Number(entry.value)).toFixed(1)}%`}
          labelLine={false}
        >
          {slices.map((slice, i) => (
            <Cell key={i} fill={holdingColor(slice.colorKey)} />
          ))}
        </Pie>
        <Tooltip formatter={v => `${pct(Number(v)).toFixed(1)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
