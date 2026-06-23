import type { BacktestResponse } from '../../types'
import { EmptyChart } from './ChartCard'
import { useI18n } from '../../i18n/useI18n'
import type { MessageKey } from '../../i18n/messages'

function hitRateColor(rate: number) {
  if (rate >= 0.6) return 'text-red-600 font-semibold'
  if (rate >= 0.5) return 'text-amber-600'
  return 'text-blue-600'
}

function returnColor(pct: number) {
  return pct >= 0 ? 'text-red-600' : 'text-blue-600'
}

// Map known backend signal label values to i18n keys (display-time only; backend data unchanged).
const SIGNAL_LABEL_KEY: Record<string, MessageKey> = {
  'ゴールデンクロス': 'backtest.signal.golden',
  'デッドクロス': 'backtest.signal.dead',
  'RSI 売られすぎ反転': 'backtest.signal.rsiOversold',
  'RSI 買われすぎ反転': 'backtest.signal.rsiOverbought',
}

export default function SignalBacktestTable({ data }: { data?: BacktestResponse }) {
  const { t } = useI18n()
  if (!data || data.signals.length === 0) {
    return <EmptyChart message={t('backtest.empty')} />
  }
  if (data.error && data.total_points === 0) {
    return <EmptyChart message={t('backtest.fetchFailed', { error: data.error })} />
  }

  const windows = data.windows
  const signalLabel = (label: string) => (SIGNAL_LABEL_KEY[label] ? t(SIGNAL_LABEL_KEY[label]) : label)

  return (
    <div className="bg-surface rounded-lg shadow overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm responsive-table">
        <thead className="bg-surface-muted text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">{t('backtest.col.signal')}</th>
            <th className="px-4 py-2 text-right whitespace-nowrap">{t('backtest.col.occurrences')}</th>
            {windows.map(w => (
              <th key={w} className="px-4 py-2 text-right whitespace-nowrap">{t('backtest.col.window', { n: w })}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.signals.map(sig => (
            <tr key={sig.key} className="border-t hover:bg-surface-muted">
              <td className="px-4 py-2 font-medium" data-label={t('backtest.col.signal')}>
                {signalLabel(sig.label)}
                <span className={`ml-2 text-xs ${sig.direction === 'bullish' ? 'text-red-500' : 'text-blue-500'}`}>
                  {sig.direction === 'bullish' ? t('backtest.dir.bullish') : t('backtest.dir.bearish')}
                </span>
              </td>
              <td className="px-4 py-2 text-right text-muted-foreground" data-label={t('backtest.col.occurrences')}>{sig.occurrences}</td>
              {windows.map(w => {
                const wr = sig.windows.find(x => x.window_days === w)
                if (!wr || wr.evaluated === 0) {
                  return <td key={w} className="px-4 py-2 text-right text-muted-foreground" data-label={t('backtest.col.window', { n: w })}>-</td>
                }
                return (
                  <td key={w} className="px-4 py-2 text-right whitespace-nowrap" data-label={t('backtest.col.window', { n: w })}>
                    <span className={hitRateColor(wr.hit_rate)}>{(wr.hit_rate * 100).toFixed(0)}%</span>
                    <span className="text-gray-300"> / </span>
                    <span className={returnColor(wr.avg_return_pct)}>{wr.avg_return_pct >= 0 ? '+' : ''}{wr.avg_return_pct.toFixed(1)}%</span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground px-4 py-2 border-t">
        {t('backtest.footer', {
          smaShort: data.params.sma_short,
          smaLong: data.params.sma_long,
          rsiPeriod: data.params.rsi_period,
          rsiLower: data.params.rsi_lower,
          rsiUpper: data.params.rsi_upper,
          points: data.total_points,
        })}
      </p>
    </div>
  )
}
