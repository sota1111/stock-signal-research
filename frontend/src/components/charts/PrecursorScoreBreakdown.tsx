import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import { EmptyChart } from './ChartCard'
import type { PrecursorBreakdown } from '../../pages/precursorScore'
import { useI18n } from '../../i18n/useI18n'

/**
 * SOT-1160 (案B): 前兆スコア内訳ウォーターフォール（積み上げ棒）。
 * 選択テーマの precursor_score を加点要素に分解して可視化する:
 *  - 「前兆スコア」行に MoM寄与（momPoints）＋ 連続増寄与（streakPoints）を stackId で積み上げ、
 *    棒全体の長さ＝ breakdown.total（＝ precursor_score）になる。
 *  - 一致度（alignment）は scoring.py の合計には含まれない「補助要素」なので、合計に足さず
 *    別行で淡色表示する。
 * 加点が一切無く一致度も無いテーマでは空状態を表示し破綻しない。
 */
const COLORS = {
  mom: '#ef4444', // 直近月MoM加点（PrecursorOverlayLine のマーカーと同系）
  streak: '#f59e0b', // 3ヶ月連続増の帯と同系
  alignment: '#93c5fd', // 補助要素は淡いブルー
}

export default function PrecursorScoreBreakdown({
  breakdown,
  alignmentScore,
}: {
  breakdown: PrecursorBreakdown
  alignmentScore?: number
}) {
  const { t } = useI18n()

  const hasAlignment = typeof alignmentScore === 'number' && alignmentScore > 0
  if (breakdown.total <= 0 && !hasAlignment) {
    return <EmptyChart message={t('signals.precursorBreakdown.empty')} />
  }

  // 前兆スコア行（MoM寄与＋連続増寄与を積み上げ）。一致度は合計に含めず別行。
  const scoreRow: {
    name: string
    mom: number
    streak: number
    alignment: number
  } = {
    name: t('signals.precursorBreakdown.total'),
    mom: breakdown.momPoints,
    streak: breakdown.streakPoints,
    alignment: 0,
  }
  const data = [scoreRow]
  if (hasAlignment) {
    data.push({
      name: t('signals.precursorBreakdown.alignment'),
      mom: 0,
      streak: 0,
      alignment: alignmentScore as number,
    })
  }

  return (
    <div className="space-y-2">
      <ResponsiveContainer width="100%" height={hasAlignment ? 180 : 130}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 8, right: 32, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={96} />
          <Tooltip
            labelStyle={{ fontSize: 12 }}
            formatter={(value, name) => [`+${Number(value)}`, String(name)]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="mom"
            name={t('signals.precursorBreakdown.momPoints')}
            stackId="score"
            fill={COLORS.mom}
          />
          <Bar
            dataKey="streak"
            name={t('signals.precursorBreakdown.streakPoints')}
            stackId="score"
            fill={COLORS.streak}
          >
            {/* 合計ラベルを連続増寄与の末端に表示（＝棒全体＝前兆スコア） */}
          </Bar>
          <Bar
            dataKey="alignment"
            name={t('signals.precursorBreakdown.alignment')}
            stackId="aux"
            fill={COLORS.alignment}
          >
            {data.map((_, i) => (
              <Cell key={i} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground text-center">
        {t('signals.precursorBreakdown.formula', {
          total: breakdown.total,
          mom: breakdown.momPoints,
          streak: breakdown.streakPoints,
        })}
      </p>
    </div>
  )
}
