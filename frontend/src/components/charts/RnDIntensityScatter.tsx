import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { EmptyChart } from './ChartCard'
import { formatCompact } from './chartUtils'
import { useI18n } from '../../i18n/useI18n'
import type { RnDIntensityPoint } from '../../pages/dashboardData'

/**
 * G2: R&D集約度 散布図（SOT-1126）。
 * X=R&D/売上比率(%), Y=時価総額成長率(株価騰落率%で近似), バブル径=売上規模。
 */
export default function RnDIntensityScatter({ points }: { points: RnDIntensityPoint[] }) {
  const { t } = useI18n()
  const data = (points ?? []).filter(
    p => Number.isFinite(p.rndRatio) && Number.isFinite(p.growth) && Number.isFinite(p.revenue) && p.revenue > 0,
  )
  if (data.length === 0) return <EmptyChart message={t('chart.rndScatter.empty')} />

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ScatterChart margin={{ top: 16, right: 24, left: 8, bottom: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis
          type="number"
          dataKey="rndRatio"
          name={t('chart.rndScatter.x')}
          unit="%"
          tick={{ fontSize: 11 }}
          label={{ value: t('chart.rndScatter.x'), position: 'insideBottomRight', fontSize: 11, offset: -4 }}
        />
        <YAxis
          type="number"
          dataKey="growth"
          name={t('chart.rndScatter.y')}
          tick={{ fontSize: 11 }}
          width={56}
          tickFormatter={v => `${v}%`}
        />
        <ZAxis type="number" dataKey="revenue" range={[60, 500]} name={t('chart.rndScatter.z')} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={({ payload }) => {
            if (!payload || payload.length === 0) return null
            const p = payload[0].payload as RnDIntensityPoint
            return (
              <div className="bg-white border rounded shadow px-2 py-1 text-xs">
                <p className="font-semibold">{p.name}</p>
                <p>{t('chart.rndScatter.x')} {p.rndRatio.toFixed(1)}%</p>
                <p>{t('chart.rndScatter.y')} {p.growth.toFixed(1)}%</p>
                <p>{t('chart.rndScatter.z')} ${formatCompact(p.revenue)}</p>
              </div>
            )
          }}
        />
        <Scatter data={data} fill="#8b5cf6" fillOpacity={0.6} />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
