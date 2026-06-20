import type { BacktestResponse } from '../../types'
import { EmptyChart } from './ChartCard'

function hitRateColor(rate: number) {
  if (rate >= 0.6) return 'text-red-600 font-semibold'
  if (rate >= 0.5) return 'text-amber-600'
  return 'text-blue-600'
}

function returnColor(pct: number) {
  return pct >= 0 ? 'text-red-600' : 'text-blue-600'
}

export default function SignalBacktestTable({ data }: { data?: BacktestResponse }) {
  if (!data || data.signals.length === 0) {
    return <EmptyChart message="バックテスト結果がありません" />
  }
  if (data.error && data.total_points === 0) {
    return <EmptyChart message={`株価取得失敗（${data.error}）`} />
  }

  const windows = data.windows

  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm responsive-table">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-4 py-2 text-left">シグナル</th>
            <th className="px-4 py-2 text-right whitespace-nowrap">発生回数</th>
            {windows.map(w => (
              <th key={w} className="px-4 py-2 text-right whitespace-nowrap">{w}日後 的中率 / 平均</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.signals.map(sig => (
            <tr key={sig.key} className="border-t hover:bg-gray-50">
              <td className="px-4 py-2 font-medium" data-label="シグナル">
                {sig.label}
                <span className={`ml-2 text-xs ${sig.direction === 'bullish' ? 'text-red-500' : 'text-blue-500'}`}>
                  {sig.direction === 'bullish' ? '強気' : '弱気'}
                </span>
              </td>
              <td className="px-4 py-2 text-right text-gray-600" data-label="発生回数">{sig.occurrences}</td>
              {windows.map(w => {
                const wr = sig.windows.find(x => x.window_days === w)
                if (!wr || wr.evaluated === 0) {
                  return <td key={w} className="px-4 py-2 text-right text-gray-400" data-label={`${w}日後`}>-</td>
                }
                return (
                  <td key={w} className="px-4 py-2 text-right whitespace-nowrap" data-label={`${w}日後`}>
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
      <p className="text-xs text-gray-400 px-4 py-2 border-t">
        SMA{data.params.sma_short}/{data.params.sma_long}・RSI{data.params.rsi_period}（{data.params.rsi_lower}/{data.params.rsi_upper}） / 対象 {data.total_points} 営業日。的中率=発生後にシグナル方向へ動いた割合、平均=フォワード平均リターン。
      </p>
    </div>
  )
}
