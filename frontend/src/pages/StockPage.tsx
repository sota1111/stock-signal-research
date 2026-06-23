import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchBacktest, fetchCategories, fetchCategoryMarketCap, fetchFundamentalsCompanies, fetchFinancialFundamentals } from '../api'
import ChartCard from '../components/charts/ChartCard'
import StockPriceLines from '../components/charts/StockPriceLines'
import NormalizedCompareLines from '../components/charts/NormalizedCompareLines'
import ReturnRankingBar from '../components/charts/ReturnRankingBar'
import ValuationScatter from '../components/charts/ValuationScatter'
import SignalBacktestTable from '../components/charts/SignalBacktestTable'
import CategoryMarketCapChart from '../components/charts/CategoryMarketCapChart'
import FinancialFundamentalsChart from '../components/charts/FinancialFundamentalsChart'
import { useDashboardQuery, useTickerStocks, useAllThemes, filterCompaniesByCategory } from './dashboardData'
import { StockEvalCard, DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

const CATEGORY_STALE_TIME = 1000 * 60 * 30

export default function StockPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useDashboardQuery()

  // === 概観グラフ(A1〜A4)の大カテゴリ絞り込み（SOT-1149）===
  // 注目企業を選択した大カテゴリ(Theme.category)に属する企業のみへ絞り、A1〜A4 を見やすくする。
  // 選択肢のユニバースは全テーマ（未取得時は trending_themes）。空選択=全カテゴリ(全件)。
  const { data: allThemes } = useAllThemes()
  const [overviewCategory, setOverviewCategory] = useState<string>('')
  const overviewThemes = allThemes && allThemes.length > 0 ? allThemes : data?.trending_themes ?? []
  const scopedCompanies = filterCompaniesByCategory(data?.notable_companies ?? [], overviewCategory, overviewThemes)
  const { tickerCompanies, stockQueries, stockItems } = useTickerStocks(scopedCompanies)

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

  // === 財務ファンダメンタルズ時系列（SOT-1121 / 候補D・SEC EDGAR XBRL）===
  const { data: fundCompanies } = useQuery({
    queryKey: ['fundamentals-companies'],
    queryFn: fetchFundamentalsCompanies,
    staleTime: CATEGORY_STALE_TIME,
  })
  const fundTickers = (fundCompanies?.companies ?? []).filter(c => c.has_data)
  const [selectedFundTicker, setSelectedFundTicker] = useState<string>('')
  const effectiveFundTicker = selectedFundTicker || fundTickers[0]?.ticker || ''
  const { data: fundamentals, isLoading: isFundLoading } = useQuery({
    queryKey: ['financial-fundamentals', effectiveFundTicker],
    queryFn: () => fetchFinancialFundamentals(effectiveFundTicker),
    staleTime: CATEGORY_STALE_TIME,
    enabled: !!effectiveFundTicker,
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

  // 概観グラフの大カテゴリ選択肢（Theme.category, SOT-1149）。先頭に「全カテゴリ」を置く。
  const overviewCategories = [...new Set(overviewThemes.map(th => th.category).filter(Boolean))].sort()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('nav.stock')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('stock.subtitle')}</p>
      </div>

      {/* === カテゴリ別 時価総額推移（SOT-1056 / A-1 + B-3） === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('category.section.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('category.section.subtitle')}</p>
        </div>
        {mcapCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('category.noData')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="text-xs text-muted-foreground">{t('category.selectLabel')}</span>
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
              <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="text-xs text-muted-foreground">{t('category.topNLabel')}</span>
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
                <p className="py-16 text-center text-sm text-muted-foreground">{t('category.loading')}</p>
              ) : (
                <CategoryMarketCapChart data={categoryMcap} />
              )}
            </ChartCard>
            <p className="text-xs text-muted-foreground">{t('category.note', { n: topN })}</p>
          </>
        )}
      </section>

      {/* === 財務ファンダメンタルズ時系列（SOT-1121 / 候補D・SEC EDGAR XBRL） === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('fundamentals.section.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('fundamentals.section.subtitle')}</p>
        </div>
        {fundTickers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('fundamentals.noData')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="text-xs text-muted-foreground">{t('fundamentals.selectLabel')}</span>
                <select
                  value={effectiveFundTicker}
                  onChange={e => setSelectedFundTicker(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-sky-400 focus:ring-1 focus:ring-sky-400 max-w-[20rem]"
                >
                  {fundTickers.map(c => (
                    <option key={c.ticker} value={c.ticker}>
                      {c.ticker}{c.name ? ` — ${c.name}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ChartCard
              title={t('fundamentals.chart.title')}
              subtitle={fundamentals?.name ?? effectiveFundTicker}
            >
              {isFundLoading ? (
                <p className="py-16 text-center text-sm text-muted-foreground">{t('fundamentals.loading')}</p>
              ) : (
                <FinancialFundamentalsChart data={fundamentals} />
              )}
            </ChartCard>
            <p className="text-xs text-muted-foreground">{t('fundamentals.note')}</p>
          </>
        )}
      </section>

      {/* === ページ上部: 概観グラフ + 表示/非表示トグル（SOT-1003） === */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">{t('stock.overview.title')}</h2>
          {tickerCompanies.length > 0 && (
            <span className="text-xs text-muted-foreground">{t('stock.coverage', { ok: loadedCount, total: tickerCompanies.length })}</span>
          )}
        </div>
        {/* 大カテゴリ選択: A1〜A4 を選択カテゴリの企業のみに絞る（SOT-1149） */}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="stock-overview-category" className="shrink-0 text-sm text-muted-foreground">
            {t('dashboard.categoryLabel')}
          </label>
          <select
            id="stock-overview-category"
            value={overviewCategory}
            onChange={e => setOverviewCategory(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-sky-400 focus:ring-1 focus:ring-sky-400 max-w-[20rem]"
          >
            <option value="">{t('dashboard.allCategories')}</option>
            {overviewCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{t('stock.overview.companyCount', { n: tickerCompanies.length })}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="shrink-0 text-sm text-muted-foreground">{t('stock.graphsLabel')}</span>
          {GRAPHS.map(g => (
            <label key={g.id} className="flex items-center gap-1.5 text-sm text-muted-foreground">
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
        <h2 className="text-lg font-semibold text-foreground mb-3">{t('stock.eval.title')}</h2>
        {tickerCompanies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('stock.noTicker')}</p>
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
        <h2 className="text-lg font-semibold text-foreground mb-3">{t('stock.backtest.title')}</h2>
        {!backtestTicker ? (
          <p className="text-sm text-muted-foreground">{t('stock.noTicker')}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              {t('stock.backtest.target', { ticker: backtest?.ticker ?? backtestTicker })}
            </p>
            <SignalBacktestTable data={backtest} />
          </>
        )}
      </section>
    </div>
  )
}
