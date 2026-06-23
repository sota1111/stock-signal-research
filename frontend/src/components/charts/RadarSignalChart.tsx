import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { EmptyChart } from './ChartCard'
import { useI18n } from '../../i18n/useI18n'
import type { RadarAxisPoint } from '../../pages/dashboardData'

/**
 * G7: テーマ多面シグナル レーダーチャート（SOT-1126）。
 * 論文 / 特許 / 13F / 財務 / エビデンス の5軸を 0–100 正規化スコアで表示する。
 */
export default function RadarSignalChart({ data }: { data: RadarAxisPoint[] }) {
  const { t } = useI18n()
  const hasData = (data ?? []).some(d => d.value > 0)
  if (!data || data.length === 0 || !hasData) return <EmptyChart message={t('chart.radar.empty')} />

  return (
    <ResponsiveContainer width="100%" height={340}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid />
        <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
        <Tooltip formatter={value => [`${Number(value)}`, t('chart.radar.score')]} labelStyle={{ fontSize: 12 }} />
        <Radar name={t('chart.radar.score')} dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
