import type { Company, StockData } from '../types'
import { formatPrice, formatMarketCap } from './dashboardData'
import { useI18n } from '../i18n/useI18n'

export function DashboardLoading() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <span className="h-8 w-8 mb-3 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
      <p className="text-sm">{t('dashboard.loading')}</p>
    </div>
  )
}

export function DashboardError() {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-md text-center py-16">
      <div className="text-3xl mb-2" aria-hidden>⚠️</div>
      <p className="font-semibold text-slate-700">{t('dashboard.error')}</p>
      <p className="text-sm text-slate-400 mt-1">{t('status.warning.message')}</p>
    </div>
  )
}

export function StockEvalCard({ company, stock, isLoading, isError }: { company: Company; stock?: StockData; isLoading: boolean; isError: boolean }) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 animate-pulse">
        <p className="font-semibold text-gray-800">{company.name}</p>
        <p className="text-xs text-gray-400 mt-2">株価読み込み中...</p>
      </div>
    )
  }

  const failed = isError || !stock || stock.error || stock.prices.length === 0
  if (failed) {
    return (
      <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-300">
        <div className="flex justify-between items-start">
          <p className="font-semibold text-gray-800">{company.name}</p>
          {company.ticker && <span className="text-xs text-gray-500">{company.ticker}</span>}
        </div>
        <p className="text-xs text-gray-400 mt-2">株価取得失敗{stock?.error ? `（${stock.error}）` : ''}</p>
      </div>
    )
  }

  const first = stock.prices[0].close
  const last = stock.prices[stock.prices.length - 1].close
  const changePct = first !== 0 ? ((last - first) / first) * 100 : 0
  const changeColor = changePct >= 0 ? 'text-red-600' : 'text-blue-600'

  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4 border-emerald-500">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-gray-800">{company.name}</p>
          <p className="text-xs text-gray-500">{stock.ticker}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-800">{formatPrice(last, stock.currency)}</p>
          <p className="text-xs text-gray-400">最新終値</p>
        </div>
      </div>
      <div className="flex justify-between items-center mt-3 text-sm">
        <span className="text-gray-500">10年騰落率</span>
        <span className={`font-bold ${changeColor}`}>{changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%</span>
      </div>
      <div className="flex justify-between items-center mt-1 text-xs text-gray-500">
        <span>時価総額 {formatMarketCap(stock.financials.market_cap)}</span>
        <span>PER {stock.financials.trailing_pe != null ? stock.financials.trailing_pe.toFixed(1) : '-'}</span>
      </div>
    </div>
  )
}
