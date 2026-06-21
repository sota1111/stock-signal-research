import type { Company, StockData } from '../types'
import { formatPrice, formatMarketCap } from './dashboardData'
import { useI18n } from '../i18n/useI18n'
import { PageLoading, PageError } from '../components/AsyncState'

// 共通の AsyncState コンポーネントへ委譲し、全ページで表示を統一する（SOT-996）。
export function DashboardLoading() {
  const { t } = useI18n()
  return <PageLoading message={t('dashboard.loading')} />
}

export function DashboardError({ onRetry }: { onRetry?: () => void } = {}) {
  const { t } = useI18n()
  return <PageError message={t('dashboard.error')} onRetry={onRetry} />
}

export function StockEvalCard({ company, stock, isLoading, isError }: { company: Company; stock?: StockData; isLoading: boolean; isError: boolean }) {
  const { t } = useI18n()
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 animate-pulse">
        <p className="font-semibold text-gray-800">{company.name}</p>
        <p className="text-xs text-gray-400 mt-2">{t('stock.loadingPrice')}</p>
      </div>
    )
  }

  // 取得エラー（通信/サーバ）と、データはあるが対象銘柄の株価が無いだけ（=正常な空）を切り分けて表示する（SOT-1003）。
  const isFetchError = isError || !!stock?.error
  const isNoData = !stock || stock.prices.length === 0
  if (isFetchError || isNoData) {
    const errorBorder = isFetchError
    return (
      <div className={`bg-white rounded-lg shadow p-4 border-l-4 ${errorBorder ? 'border-amber-400' : 'border-gray-200'}`}>
        <div className="flex justify-between items-start">
          <p className="font-semibold text-gray-800">{company.name}</p>
          {company.ticker && <span className="text-xs text-gray-500">{company.ticker}</span>}
        </div>
        <p className={`text-xs mt-2 ${errorBorder ? 'text-amber-600' : 'text-gray-400'}`}>
          {errorBorder
            ? `${t('stock.fetchFailed')}${stock?.error ? `（${stock.error}）` : ''}`
            : t('stock.noPriceData')}
        </p>
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
          <p className="text-xs text-gray-400">{t('stock.latestClose')}</p>
        </div>
      </div>
      <div className="flex justify-between items-center mt-3 text-sm">
        <span className="text-gray-500">{t('stock.tenYearReturn')}</span>
        <span className={`font-bold ${changeColor}`}>{changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%</span>
      </div>
      <div className="flex justify-between items-center mt-1 text-xs text-gray-500">
        <span>{t('stock.marketCap')} {formatMarketCap(stock.financials.market_cap)}</span>
        <span>PER {stock.financials.trailing_pe != null ? stock.financials.trailing_pe.toFixed(1) : '-'}</span>
      </div>
    </div>
  )
}
