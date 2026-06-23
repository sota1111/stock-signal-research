import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import { EmptyChart } from './ChartCard'
import { useI18n } from '../../i18n/useI18n'

/**
 * SOT-1161 (案C): 全テーマ俯瞰のモメンタム散布図。
 * 各テーマを「直近MoM%（横）× 連続増加月数（縦）」にプロットし、バブル径＝直近論文数、
 * 色＝前兆スコアで表現する。MoM 20%/50% の閾値ラインと「強い前兆ゾーン（右上）」を明示し、
 * どのテーマが前兆ゾーンに入っているかを一画面で俯瞰できるようにする。
 */
export interface ThemeMomentumPoint {
  id: string
  name: string
  momPct: number // latest-month MoM% (x). 0 when undefined.
  streakMonths: number // trailing increasing run length (y)
  latestCount: number // latest aggregated month's paper count (bubble size, z)
  score: number // precursor_score (color)
}

// 前兆スコアの段階で色分け（アプリの加点系パレットと整合）。
function colorForScore(score: number): string {
  if (score >= 60) return '#ef4444' // 強い前兆
  if (score >= 40) return '#f59e0b'
  if (score >= 20) return '#fbbf24'
  return '#94a3b8' // 低スコア
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ThemeMomentumPoint }> }) {
  const { t } = useI18n()
  if (!active || !payload || payload.length === 0) return null
  const p = payload[0].payload
  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-xs shadow">
      <p className="font-semibold text-foreground">{p.name}</p>
      <p className="text-muted-foreground">
        {t('signals.momentumScatter.score')}: <span className="font-medium text-foreground">{p.score.toFixed(0)}</span>
      </p>
      <p className="text-muted-foreground">
        {t('signals.momentumScatter.mom')}: <span className="font-medium text-foreground">{p.momPct.toFixed(1)}%</span>
      </p>
      <p className="text-muted-foreground">
        {t('signals.momentumScatter.streak')}: <span className="font-medium text-foreground">{p.streakMonths}</span>
      </p>
      <p className="text-muted-foreground">
        {t('signals.momentumScatter.latestCount')}: <span className="font-medium text-foreground">{p.latestCount}</span>
      </p>
    </div>
  )
}

export default function ThemeMomentumScatter({ points }: { points: ThemeMomentumPoint[] }) {
  const { t } = useI18n()

  if (!points || points.length === 0) {
    return <EmptyChart message={t('signals.momentumScatter.empty')} />
  }

  // 軸範囲: 閾値ライン(20/50)が必ず見えるよう X の最大は実データと50の大きい方に余白を足す。
  const maxMom = Math.max(50, ...points.map(p => p.momPct))
  const maxStreak = Math.max(3, ...points.map(p => p.streakMonths))

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ScatterChart margin={{ top: 16, right: 24, bottom: 28, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        {/* 強い前兆ゾーン（右上）: MoM>50% かつ 連続増加あり */}
        <ReferenceArea
          x1={50}
          x2={maxMom + 5}
          y1={1}
          y2={maxStreak + 1}
          fill="#ef4444"
          fillOpacity={0.06}
          label={{ value: t('signals.momentumScatter.zoneLabel'), position: 'insideTopRight', fontSize: 11, fill: '#b91c1c' }}
        />
        <XAxis
          type="number"
          dataKey="momPct"
          name={t('signals.momentumScatter.axisMom')}
          domain={[0, maxMom + 5]}
          tick={{ fontSize: 11 }}
          label={{ value: t('signals.momentumScatter.axisMom'), position: 'insideBottom', offset: -16, fontSize: 11 }}
        />
        <YAxis
          type="number"
          dataKey="streakMonths"
          name={t('signals.momentumScatter.axisStreak')}
          domain={[0, maxStreak + 1]}
          allowDecimals={false}
          tick={{ fontSize: 11 }}
          label={{ value: t('signals.momentumScatter.axisStreak'), angle: -90, position: 'insideLeft', fontSize: 11 }}
        />
        <ZAxis type="number" dataKey="latestCount" range={[60, 400]} name={t('signals.momentumScatter.latestCount')} />
        <ReferenceLine x={20} stroke="#fbbf24" strokeDasharray="4 4" label={{ value: t('signals.momentumScatter.threshold20'), fontSize: 10, fill: '#a16207', position: 'top' }} />
        <ReferenceLine x={50} stroke="#ef4444" strokeDasharray="4 4" label={{ value: t('signals.momentumScatter.threshold50'), fontSize: 10, fill: '#b91c1c', position: 'top' }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ScatterTooltip />} />
        <Scatter data={points}>
          {points.map(p => (
            <Cell key={p.id} fill={colorForScore(p.score)} fillOpacity={0.8} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  )
}
