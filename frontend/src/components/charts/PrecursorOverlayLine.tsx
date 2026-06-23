import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceDot,
} from 'recharts'
import { EmptyChart } from './ChartCard'
import type { PaperMonthlyCount } from '../../types'
import { aggregateMonthly, computePrecursorBreakdown } from '../../pages/precursorScore'
import { useI18n } from '../../i18n/useI18n'

/**
 * SOT-1159 (案A): 前兆判定オーバーレイ折れ線。
 * 選択テーマの月次論文件数を折れ線で描き、前兆スコアの加点根拠を重ね描きする:
 *  - 加点が発生した直近月に ReferenceDot（MoM% と加点を注記）
 *  - 直近3ヶ月連続増加（+20点）の区間を ReferenceArea で帯ハイライト
 * MoM閾値（20% / 50%）の意味は ChartCard 側のキャプションで補足する。
 */
export default function PrecursorOverlayLine({ data }: { data: PaperMonthlyCount[] }) {
  const { t } = useI18n()
  const series = aggregateMonthly(data)
  if (series.length === 0) return <EmptyChart message={t('chart.empty.monthly')} />

  const breakdown = computePrecursorBreakdown(series)
  const chartData = series.map(p => ({ year_month: p.year_month, count: p.count }))

  // 直近MoM加点マーカーの座標（最終月）。
  const latestPoint = breakdown.latestMonth
    ? chartData.find(d => d.year_month === breakdown.latestMonth)
    : undefined
  const momLabel =
    breakdown.momPct !== null
      ? `${breakdown.momPct >= 0 ? '+' : ''}${breakdown.momPct.toFixed(0)}% → +${breakdown.momPoints}`
      : ''

  // 連続増加帯の両端（最古〜最新）。
  const streakStart = breakdown.streakMonths[0]
  const streakEnd = breakdown.streakMonths[breakdown.streakMonths.length - 1]

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="year_month" tick={{ fontSize: 11 }} minTickGap={40} />
        <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
        <Tooltip
          labelStyle={{ fontSize: 12 }}
          formatter={value => [t('chart.value.papers', { n: Number(value) }), t('chart.legend.paperCount')]}
        />
        {/* 連続増加区間（+20点の根拠）を帯でハイライト */}
        {breakdown.streakPoints > 0 && streakStart && streakEnd && (
          <ReferenceArea x1={streakStart} x2={streakEnd} fill="#f59e0b" fillOpacity={0.12} stroke="#f59e0b" strokeOpacity={0.3} />
        )}
        <Line type="monotone" dataKey="count" stroke="#10b981" dot={false} strokeWidth={2} />
        {/* 直近MoM加点が出た月にマーカー＋注記 */}
        {breakdown.momPoints > 0 && latestPoint && (
          <ReferenceDot
            x={latestPoint.year_month}
            y={latestPoint.count}
            r={5}
            fill="#ef4444"
            stroke="#fff"
            strokeWidth={1.5}
            label={{ value: `${latestPoint.year_month} ${momLabel}`, position: 'top', fontSize: 11, fill: '#ef4444' }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
