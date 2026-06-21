import { useQuery } from '@tanstack/react-query'
import { fetchBacktest } from '../api'
import ChartCard from '../components/charts/ChartCard'
import StockPriceLines from '../components/charts/StockPriceLines'
import NormalizedCompareLines from '../components/charts/NormalizedCompareLines'
import ReturnRankingBar from '../components/charts/ReturnRankingBar'
import ValuationScatter from '../components/charts/ValuationScatter'
import SignalBacktestTable from '../components/charts/SignalBacktestTable'
import { useDashboardQuery, useTickerStocks } from './dashboardData'
import { StockEvalCard, DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

export default function StockPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useDashboardQuery()
  const { tickerCompanies, stockQueries, stockItems } = useTickerStocks(data?.notable_companies ?? [])

  // バックテスト: 注目企業の先頭ティッカーを対象に各シグナルの的中率/リターンを集計
  const backtestTicker = tickerCompanies[0]?.ticker
  const { data: backtest } = useQuery({
    queryKey: ['backtest', backtestTicker],
    queryFn: () => fetchBacktest(backtestTicker as string, 10),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!backtestTicker,
  })

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('nav.stock')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('stock.subtitle')}</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">{t('stock.eval.title')}</h2>
        {tickerCompanies.length === 0 ? (
          <p className="text-sm text-gray-400">{t('stock.noTicker')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tickerCompanies.map((company, i) => {
              const q = stockQueries[i]
              return (
                <StockEvalCard
                  key={company.id}
                  company={company}
                  stock={q?.data}
                  isLoading={q?.isLoading ?? false}
                  isError={q?.isError ?? false}
                />
              )
            })}
          </div>
        )}
      </section>

      {/* === 株価グラフ（2000年から） === */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">{t('stock.chart.title')}</h2>
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">{t('stock.a1')}</p>
          <StockPriceLines items={stockItems} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={t('stock.a2.title')} subtitle={t('stock.a2.subtitle')}>
            <NormalizedCompareLines items={stockItems} />
          </ChartCard>
          <ChartCard title={t('stock.a3.title')} subtitle={t('stock.a3.subtitle')}>
            <ReturnRankingBar items={stockItems} />
          </ChartCard>
        </div>
        <ChartCard title={t('stock.a4.title')} subtitle={t('stock.a4.subtitle')}>
          <ValuationScatter items={stockItems} />
        </ChartCard>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">{t('stock.backtest.title')}</h2>
        {!backtestTicker ? (
          <p className="text-sm text-gray-400">{t('stock.noTicker')}</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-2">
              {t('stock.backtest.target', { ticker: backtest?.ticker ?? backtestTicker })}
            </p>
            <SignalBacktestTable data={backtest} />
          </>
        )}
      </section>
    </div>
  )
}
