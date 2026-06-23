import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from 'recharts'
import { EmptyChart } from './ChartCard'
import type { PaperMonthlyCount } from '../../types'
import { aggregateMonthly, detectSignalEvents } from '../../pages/precursorScore'
import { useI18n } from '../../i18n/useI18n'

/**
 * SOT-1162 (案D): 前兆→その後タイムライン。
 * 選択テーマの月次論文件数を折れ線で描き、シグナル発火月（MoM+20%超 または 3ヶ月連続増）に
 * ReferenceDot を打つ。チャート下に各発火イベントの一覧（発火月・MoM・発火理由・発火後3ヶ月の
 * 追従）を表示し、「前兆→その後」を可視化する。発火が無いテーマでも破綻しない。
 */
export default function SignalTimeline({ data }: { data: PaperMonthlyCount[] }) {
  const { t } = useI18n()
  const series = aggregateMonthly(data)
  if (series.length === 0) return <EmptyChart message={t('chart.empty.monthly')} />

  const events = detectSignalEvents(series)
  const chartData = series.map(p => ({ year_month: p.year_month, count: p.count }))

  const fmtMom = (mom: number | null) =>
    mom === null ? '-' : `${mom >= 0 ? '+' : ''}${mom.toFixed(0)}%`

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="year_month" tick={{ fontSize: 11 }} minTickGap={40} />
          <YAxis tick={{ fontSize: 11 }} width={40} allowDecimals={false} />
          <Tooltip
            labelStyle={{ fontSize: 12 }}
            formatter={value => [t('chart.value.papers', { n: Number(value) }), t('chart.legend.paperCount')]}
          />
          <Line type="monotone" dataKey="count" stroke="#10b981" dot={false} strokeWidth={2} />
          {/* シグナル発火月にマーカー */}
          {events.map(ev => (
            <ReferenceDot
              key={ev.year_month}
              x={ev.year_month}
              y={ev.count}
              r={5}
              fill="#ef4444"
              stroke="#fff"
              strokeWidth={1.5}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('signals.signalTimeline.noEvents')}</p>
      ) : (
        <div className="bg-surface rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm responsive-table">
            <thead className="bg-surface-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left whitespace-nowrap">{t('signals.signalTimeline.colMonth')}</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">{t('signals.signalTimeline.colMom')}</th>
                <th className="px-4 py-2 text-left">{t('signals.signalTimeline.colReason')}</th>
                <th className="px-4 py-2 text-left">{t('signals.signalTimeline.colFollowUp')}</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <tr key={ev.year_month} className="border-t hover:bg-surface-muted align-top">
                  <td className="px-4 py-2 font-medium whitespace-nowrap" data-label={t('signals.signalTimeline.colMonth')}>
                    {ev.year_month}
                  </td>
                  <td className="px-4 py-2 text-right text-green-600 font-semibold whitespace-nowrap" data-label={t('signals.signalTimeline.colMom')}>
                    {fmtMom(ev.mom)}
                  </td>
                  <td className="px-4 py-2" data-label={t('signals.signalTimeline.colReason')}>
                    <span className="flex flex-wrap gap-1">
                      {ev.momFired && (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">{t('signals.signalTimeline.reasonMom')}</span>
                      )}
                      {ev.streakFired && (
                        <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700">{t('signals.signalTimeline.reasonStreak')}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground" data-label={t('signals.signalTimeline.colFollowUp')}>
                    {ev.followUp.length === 0 ? (
                      t('signals.signalTimeline.noFollowUp')
                    ) : (
                      <span className="whitespace-nowrap">
                        {[ev.count, ...ev.followUp.map(f => f.count)].join(' → ')}
                        {ev.followUpDelta !== null && (
                          <span className={ev.followUpDelta >= 0 ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                            ({ev.followUpDelta >= 0 ? '+' : ''}{ev.followUpDelta}
                            {ev.followUpPct !== null && `, ${ev.followUpPct >= 0 ? '+' : ''}${ev.followUpPct.toFixed(0)}%`})
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
