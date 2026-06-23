import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { SERIES_COLORS } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'

const TOP_N = 8

/**
 * 機関保有の集中度（企業別・最新）を円グラフで表示する（SOT-1134）。
 * 各企業の保有比率合計(total)を全体に対するシェアとして描画する。
 * 企業数が多い場合は上位 TOP_N 社を個別スライス、残りを「その他」に集約して見やすくする。
 */
export default function HoldingsConcentrationPie({
  data,
}: {
  data: { company: string; total: number }[]
}) {
  const { t } = useI18n()

  if (data.length === 0) return <EmptyChart />

  // data は呼び出し側で total 降順にソート済み。上位 TOP_N + その他に集約する。
  const top = data.slice(0, TOP_N)
  const rest = data.slice(TOP_N)
  const restTotal = rest.reduce((sum, d) => sum + d.total, 0)
  const slices = restTotal > 0 ? [...top, { company: t('investors.concentration.others'), total: restTotal }] : top

  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="total"
          nameKey="company"
          cx="50%"
          cy="50%"
          outerRadius={110}
          label={entry => `${entry.name} ${Number(entry.value).toFixed(2)}%`}
          labelLine={false}
        >
          {slices.map((_, i) => (
            <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={v => `${Number(v).toFixed(2)}%`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
