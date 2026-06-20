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

export default function StockPage() {
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
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">株価</h1>
        <p className="text-sm text-gray-500 mt-0.5">注目企業の株価評価・推移・シグナルバックテスト（過去10年）</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">株価評価（過去10年）</h2>
        {tickerCompanies.length === 0 ? (
          <p className="text-sm text-gray-400">ティッカー登録済みの注目企業がありません。</p>
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

      {/* === 株価グラフ（過去10年） === */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">株価グラフ（過去10年）</h2>
        <div>
          <p className="text-sm font-medium text-gray-600 mb-2">A1. 株価推移（注目企業ごと）</p>
          <StockPriceLines items={stockItems} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="A2. 正規化比較（開始日=100）" subtitle="注目企業の相対パフォーマンス">
            <NormalizedCompareLines items={stockItems} />
          </ChartCard>
          <ChartCard title="A3. 10年騰落率ランキング" subtitle="プラス=赤 / マイナス=青">
            <ReturnRankingBar items={stockItems} />
          </ChartCard>
        </div>
        <ChartCard title="A4. バリュエーション散布図" subtitle="横軸PER × 縦軸時価総額 / バブル=配当利回り">
          <ValuationScatter items={stockItems} />
        </ChartCard>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">シグナル バックテスト（過去10年）</h2>
        {!backtestTicker ? (
          <p className="text-sm text-gray-400">ティッカー登録済みの注目企業がありません。</p>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-2">
              対象: {backtest?.ticker ?? backtestTicker} — 各テクニカルシグナル発生後の的中率と平均リターン
            </p>
            <SignalBacktestTable data={backtest} />
          </>
        )}
      </section>
    </div>
  )
}
