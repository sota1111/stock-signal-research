import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBacktest, fetchCategories, fetchCategoryMarketCap } from '../api'
import ChartCard from '../components/charts/ChartCard'
import StockPriceLines from '../components/charts/StockPriceLines'
import NormalizedCompareLines from '../components/charts/NormalizedCompareLines'
import ReturnRankingBar from '../components/charts/ReturnRankingBar'
import ValuationScatter from '../components/charts/ValuationScatter'
import SignalBacktestTable from '../components/charts/SignalBacktestTable'
import CategoryMarketCapChart from '../components/charts/CategoryMarketCapChart'
import { useDashboardQuery, useTickerStocks } from './dashboardData'
import { StockEvalCard, DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

const CATEGORY_STALE_TIME = 1000 * 60 * 30

export default function StockPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useDashboardQuery()
  const { tickerCompanies, stockQueries, stockItems } = useTickerStocks(data?.notable_companies ?? [])

  // === カテゴリ別 時価総額推移（SOT-1056 / A-1 + B-3）===
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: CATEGORY_STALE_TIME,
  })
  // 時価総額データのあるカテゴリのみセレクタに出す。
  const mcapCategories = (categories?.categories ?? []).filter(c => c.has_market_cap)
  const [selectedTheme, setSelectedTheme] = useState<string>('')
  const [topN, setTopN] = useState<number>(10)
  // 明示選択が無ければ先頭カテゴリを既定にする（effect で setState せず派生値で解決）。
  const effectiveTheme = selectedTheme || mcapCategories[0]?.theme_id || ''

  const { data: categoryMcap, isLoading: isCategoryLoading } = useQuery({
    queryKey: ['category-market-cap', effectiveTheme, topN],
    queryFn: () => fetchCategoryMarketCap(effectiveTheme, topN),
    staleTime: CATEGORY_STALE_TIME,
    enabled: !!effectiveTheme,
  })

  // バックテスト: 注目企業の先頭ティッカーを対象に各シグナルの的中率/リターンを集計
  const backtestTicker = tickerCompanies[0]?.ticker
  const { data: backtest } = useQuery({
    queryKey: ['backtest', backtestTicker],
    queryFn: () => fetchBacktest(backtestTicker as string, 10),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!backtestTicker,
  })

  // 概観グラフの表示/非表示状態（SOT-1003）。
  const [hiddenGraphs, setHiddenGraphs] = useState<Record<string, boolean>>({})

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  // 株価データ取得カバレッジ（取得失敗を「全体失敗」に見せないための要約, SOT-1003）。
  const loadedCount = stockItems.filter(it => it.stock && !it.stock.error && it.stock.prices.length > 0).length

  // 概観グラフの表示/非表示トグル（SOT-1003 / ページ上部）。
  const GRAPHS = [
    { id: 'a1', label: t('stock.a1') },
    { id: 'a2', label: t('stock.a2.title') },
    { id: 'a3', label: t('stock.a3.title') },
    { id: 'a4', label: t('stock.a4.title') },
  ]
  const isGraphVisible = (id: string) => !hiddenGraphs[id]
  const toggleGraph = (id: string) => setHiddenGraphs(h => ({ ...h, [id]: !h[id] }))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('nav.stock')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('stock.subtitle')}</p>
      </div>

      {/* === カテゴリ別 時価総額推移（SOT-1056 / A-1 + B-3） === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{t('category.section.title')}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t('category.section.subtitle')}</p>
        </div>
        {mcapCategories.length === 0 ? (
          <p className="text-sm text-gray-400">{t('category.noData')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-600">
                <span className="text-xs text-gray-500">{t('category.selectLabel')}</span>
                <select
                  value={effectiveTheme}
                  onChange={e => setSelectedTheme(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-sky-400 focus:ring-1 focus:ring-sky-400 max-w-[20rem]"
                >
                  {mcapCategories.map(c => (
                    <option key={c.theme_id} value={c.theme_id}>
                      {c.theme_name} ({c.company_count})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-600">
                <span className="text-xs text-gray-500">{t('category.topNLabel')}</span>
                <select
                  value={topN}
                  onChange={e => setTopN(Number(e.target.value))}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                >
                  {[5, 10, 20].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <ChartCard
              title={t('category.chart.title', { n: topN })}
              subtitle={categoryMcap?.theme_name ?? undefined}
            >
              {isCategoryLoading ? (
                <p className="py-16 text-center text-sm text-gray-400">{t('category.loading')}</p>
              ) : (
                <CategoryMarketCapChart data={categoryMcap} />
              )}
            </ChartCard>
            <p className="text-xs text-gray-400">{t('category.note', { n: topN })}</p>
          </>
        )}
      </section>

      {/* === ページ上部: 概観グラフ + 表示/非表示トグル（SOT-1003） === */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-700">{t('stock.overview.title')}</h2>
          {tickerCompanies.length > 0 && (
            <span className="text-xs text-gray-400">{t('stock.coverage', { ok: loadedCount, total: tickerCompanies.length })}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="shrink-0 text-sm text-gray-600">{t('stock.graphsLabel')}</span>
          {GRAPHS.map(g => (
            <label key={g.id} className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={isGraphVisible(g.id)}
                onChange={() => toggleGraph(g.id)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-sky-600 focus:ring-sky-400"
              />
              <span className="truncate max-w-[10rem]">{g.label}</span>
            </label>
          ))}
        </div>
        {isGraphVisible('a1') && (
          <ChartCard title={t('stock.a1')} subtitle={t('stock.chart.title')}>
            <StockPriceLines items={stockItems} />
          </ChartCard>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {isGraphVisible('a2') && (
            <ChartCard title={t('stock.a2.title')} subtitle={t('stock.a2.subtitle')}>
              <NormalizedCompareLines items={stockItems} />
            </ChartCard>
          )}
          {isGraphVisible('a3') && (
            <ChartCard title={t('stock.a3.title')} subtitle={t('stock.a3.subtitle')}>
              <ReturnRankingBar items={stockItems} />
            </ChartCard>
          )}
        </div>
        {isGraphVisible('a4') && (
          <ChartCard title={t('stock.a4.title')} subtitle={t('stock.a4.subtitle')}>
            <ValuationScatter items={stockItems} />
          </ChartCard>
        )}
      </section>

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
