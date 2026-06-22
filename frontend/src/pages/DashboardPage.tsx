import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchSignalReport, fetchThemeCitationMatrix, fetchCategoryPaperAverages, fetchCategoryPaperCounts } from '../api'
import { useFilters } from '../contexts/useFilters'
import ChartCard from '../components/charts/ChartCard'
import PapersCountChart from '../components/charts/PapersCountChart'
import CategoryAvgPapersChart from '../components/charts/CategoryAvgPapersChart'
import CategoryPaperCountsChart from '../components/charts/CategoryPaperCountsChart'
import TopMarketCapChart from '../components/charts/TopMarketCapChart'
import PapersMarketCapCrossChart from '../components/charts/PapersMarketCapCrossChart'
import ThemeCitationMatrix from '../components/ThemeCitationMatrix'
import { useDashboardQuery, useAllThemes, useTickerStocks, buildTopMarketCapYearly, buildTopMarketCapCompanyYearly, GRAPH_FROM_YEAR } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

// 論文グラフ・年レンジセレクタの下限年（SOT-987: 2016→2000 / SOT-1069: 全グラフを 2009 起点に統一）。
// バックエンドの既定「直近10年」窓ではなく、この年から論文を取得して選択肢を広げる。
const PAPER_HISTORY_FROM_YEAR = GRAPH_FROM_YEAR

export default function DashboardPage() {
  const { t, lang } = useI18n()
  const queryClient = useQueryClient()
  // テーマ選択・表示年レンジはグローバルフィルタ(URL永続化)を参照する（SOT-997）。
  const { theme: selectedTheme, setTheme, fromYear, toYear, setYearRange } = useFilters()
  const { data, isLoading, error } = useDashboardQuery()
  // 選択肢のユニバースは全テーマ（SOT-1088）。未取得時は trending_themes にフォールバック。
  const { data: allThemes } = useAllThemes()
  const { stockItems, stockQueries } = useTickerStocks(data?.notable_companies ?? [])

  // テーマ選択（選択でグラフが切り替わる）。未選択時は注目テーマの先頭。
  const reportQuery = selectedTheme || data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport, isLoading: isReportLoading, isFetching: isReportFetching } = useQuery({
    queryKey: ['signal-report', reportQuery, PAPER_HISTORY_FROM_YEAR],
    queryFn: () => fetchSignalReport(reportQuery, PAPER_HISTORY_FROM_YEAR),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  // テーマ×年 引用数マトリクス（行=テーマ / 列=2009〜現在 / セル=引用数合計, SOT-944 / SOT-1081 要件①）
  const { data: citationMatrix } = useQuery({
    queryKey: ['theme-citation-matrix', PAPER_HISTORY_FROM_YEAR],
    queryFn: () => fetchThemeCitationMatrix(10, PAPER_HISTORY_FROM_YEAR),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  // カテゴリグループ別 テーマあたり平均論文数（年次, SOT-1049）。
  // 「単純に論文数が増えたか」をテーマ数の多寡に依らず比較するための全カテゴリ集計。
  const { data: categoryAverages } = useQuery({
    queryKey: ['category-paper-averages', PAPER_HISTORY_FROM_YEAR],
    queryFn: () => fetchCategoryPaperAverages(PAPER_HISTORY_FROM_YEAR),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  // 大カテゴリ選択・テーマ検索・カード表示ON/OFF の UI 状態（SOT-1002 / 提案B 3・5）。
  const [category, setCategory] = useState('')
  const [themeSearch, setThemeSearch] = useState('')
  const [hiddenCards, setHiddenCards] = useState<Record<string, boolean>>({})
  // クロス分析（指数）の基準年。null = 自動（両系列が正の最初の共通年）。SOT-1014
  const [baseYear, setBaseYear] = useState<number | null>(null)

  // 論文カードは大カテゴリ選択で駆動する（SOT-1081 要件③④）。選択中の大カテゴリ内の
  // テーマごとの年別論文数を取得する。大カテゴリ = 明示選択 or 現在テーマのカテゴリ。
  const queryThemes = (allThemes && allThemes.length > 0 ? allThemes : data?.trending_themes) ?? []
  const queryCategory = category || queryThemes.find(th => th.name === reportQuery)?.category || ''
  const { data: categoryPaperCounts, isLoading: isCatPapersLoading, isFetching: isCatPapersFetching } = useQuery({
    queryKey: ['category-paper-counts', queryCategory, PAPER_HISTORY_FROM_YEAR],
    queryFn: () => fetchCategoryPaperCounts(queryCategory, PAPER_HISTORY_FROM_YEAR),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data && !!queryCategory,
  })

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  // データ再取得（再取得ボタン用）。状態表示・KPI は /status ページへ移行済み（SOT-991）。
  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['signal-report'] })
    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['backtest'] })
    queryClient.invalidateQueries({ queryKey: ['theme-citations'] })
    queryClient.invalidateQueries({ queryKey: ['theme-citation-matrix'] })
    queryClient.invalidateQueries({ queryKey: ['category-paper-averages'] })
  }

  const paperCounts = signalReport?.paper_counts_by_year ?? []
  // データ取得中（初期表示・テーマ切替時）は空表示ではなくローディングを出す
  const isPapersLoading = (isReportLoading || isReportFetching) && !signalReport
  const TOP_N = 10
  const marketCapYearly = buildTopMarketCapYearly(stockItems, TOP_N)
  const isMarketCapLoading = stockQueries.some(q => q.isLoading || q.isFetching) && marketCapYearly.length === 0
  // クロス分析カードは論文・時価総額の両系列に依存する。どちらかが取得中の間は
  // 空表示ではなくローディングを出す（テーマ切替時のバックグラウンド再取得を含む, SOT-1055）。
  const isCrossLoading =
    isReportLoading ||
    isReportFetching ||
    stockQueries.some(q => q.isLoading || q.isFetching) ||
    isMarketCapLoading
  const marketCapByCompany = buildTopMarketCapCompanyYearly(stockItems, TOP_N)

  // 表示年レンジ: 論文件数・時価総額の年の和集合を選択可能ドメインとする
  const yearSet = new Set<number>()
  for (const c of paperCounts) yearSet.add(c.year)
  for (const m of marketCapYearly) yearSet.add(m.year)
  const availableYears = [...yearSet].sort((a, b) => a - b)
  const minYear = availableYears.length ? availableYears[0] : null
  const maxYear = availableYears.length ? availableYears[availableYears.length - 1] : null
  // 未選択時は全期間（min〜max）を既定にする
  const effStart = fromYear ?? minYear
  const effEnd = toYear ?? maxYear
  const inRange = (year: number) =>
    (effStart == null || year >= effStart) && (effEnd == null || year <= effEnd)
  const filteredPaperCounts = paperCounts.filter(c => inRange(c.year))
  const filteredMarketCapYearly = marketCapYearly.filter(m => inRange(m.year))
  const filteredMarketCapByCompanyData = marketCapByCompany.data.filter(d => inRange(d.year))
  const showYearRange = availableYears.length > 1 && effStart != null && effEnd != null

  // クロス分析（指数）の基準年セレクタ（SOT-1014）。
  // 基準にできるのは「論文件数・時価総額がともに正」の年だけなので、その年だけを選択肢にする。
  const filteredPaperPos = new Set(filteredPaperCounts.filter(c => c.count > 0).map(c => c.year))
  const filteredMcapPos = new Set(filteredMarketCapYearly.filter(m => m.total > 0).map(m => m.year))
  const baseYearOptions = [...filteredPaperPos].filter(y => filteredMcapPos.has(y)).sort((a, b) => a - b)
  // 選択が有効ならそれ、無効/未選択なら先頭(=自動と一致)を表示値にする。
  const effectiveBaseYear =
    baseYear != null && baseYearOptions.includes(baseYear) ? baseYear : (baseYearOptions[0] ?? null)

  // 大カテゴリ→カテゴリ(テーマ) の順次選択（SOT-1002 / SOT-1088）。
  // 大カテゴリ = Theme.category。選択肢のユニバースは全テーマ（未取得時は trending_themes）。
  const themes = allThemes && allThemes.length > 0 ? allThemes : data.trending_themes
  const categories = [...new Set(themes.map(th => th.category).filter(Boolean))].sort()
  // theme_id → 大カテゴリ のマップ（引用数マトリクス・時価総額の大カテゴリ絞り込みで再利用, SOT-1089/1091）。
  const categoryByThemeId = new Map<string, string>(
    themes.filter(th => th.id && th.category).map(th => [th.id, th.category]),
  )
  const currentThemeObj = themes.find(th => th.name === reportQuery)
  const effectiveCategory = category || currentThemeObj?.category || ''
  const themesInCategory = effectiveCategory
    ? themes.filter(th => th.category === effectiveCategory)
    : themes
  const search = themeSearch.trim().toLowerCase()
  const themeOptions = themesInCategory
    .filter(th => !search || th.name.toLowerCase().includes(search))
    .map(th => th.name)
  // 現在選択中のテーマは絞り込みで消えても option に残し、select が空欄にならないようにする。
  const selectableThemes = themeOptions.includes(reportQuery)
    ? themeOptions
    : [reportQuery, ...themeOptions]

  const onSelectCategory = (cat: string) => {
    setCategory(cat)
    setThemeSearch('')
    // 大カテゴリを切り替えたら、そのカテゴリ先頭のテーマへ自動で合わせる。
    const first = (cat ? themes.filter(th => th.category === cat) : themes)[0]
    if (first && first.name !== reportQuery) setTheme(first.name)
  }

  // 引用数マトリクスは選択中の大カテゴリのテーマ行のみ表示する（SOT-1081 要件⑥）。
  // 大カテゴリ未選択時は全テーマ。行を絞った上で列合計・総合計を再計算する。
  const displayCitationMatrix = (() => {
    if (!citationMatrix) return undefined
    if (!effectiveCategory) return citationMatrix
    const rows = citationMatrix.rows.filter(
      r => r.theme_id != null && categoryByThemeId.get(r.theme_id) === effectiveCategory,
    )
    const columnTotals = citationMatrix.years.map((_, i) =>
      rows.reduce((sum, r) => sum + (r.cells[i] ?? 0), 0),
    )
    return {
      ...citationMatrix,
      rows,
      column_totals: columnTotals,
      grand_total: columnTotals.reduce((a, b) => a + b, 0),
    }
  })()

  // カード表示ON/OFF（SOT-1002 / 提案5）。
  const CARDS: { id: string; label: string }[] = [
    { id: 'cross', label: t('chart.cross.title') },
    { id: 'papers', label: t('chart.papers.title') },
    { id: 'categoryAvg', label: t('chart.categoryAvg.title') },
    { id: 'marketCap', label: t('chart.topMarketCap.title', { n: TOP_N }) },
    { id: 'matrix', label: t('chart.citationMatrix.title') },
  ]
  const isCardVisible = (id: string) => !hiddenCards[id]
  const toggleCard = (id: string) => setHiddenCards(h => ({ ...h, [id]: !h[id] }))

  const lastAnalyzed = signalReport?.generated_at ? new Date(signalReport.generated_at).toLocaleString(lang === 'en' ? 'en-US' : 'ja-JP') : '—'

  return (
    <div className="space-y-8">
      {/* === ヘッダ + テーマ/年レンジ選択 + グラフ === */}
      <section className="space-y-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('dashboard.subtitle')}</p>
          <p className="text-xs text-gray-400 mt-1">{t('dashboard.lastAnalyzed')}: {lastAnalyzed}</p>
        </div>

        {/* 各機能ページへのナビゲーション（選択中テーマを query で引き継ぐ, SOT-997/999） */}
        <div className="flex flex-wrap gap-2">
          <Link to={`/stock?theme=${encodeURIComponent(reportQuery)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.viewStock')}</Link>
          <Link to={`/papers?theme=${encodeURIComponent(reportQuery)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.viewPapers')}</Link>
          <Link to={`/investors?theme=${encodeURIComponent(reportQuery)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.viewInvestors')}</Link>
          <Link to={`/signals?theme=${encodeURIComponent(reportQuery)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.signals')}</Link>
          <Link to="/research-seeds" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.registerSeed')}</Link>
          <Link to="/input" className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.registerTheme')}</Link>
          <button onClick={refetchAll} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{t('btn.refetch')}</button>
        </div>

        {/* 大カテゴリ → テーマ の順次選択 + テーマ検索（SOT-1002 / 提案B 3） */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {/* 大カテゴリ */}
          <label htmlFor="category-select" className="shrink-0 text-sm text-gray-600">{t('dashboard.categoryLabel')}</label>
          <select
            id="category-select"
            value={effectiveCategory}
            onChange={e => onSelectCategory(e.target.value)}
            className="min-w-0 max-w-[12rem] truncate rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">{t('dashboard.allCategories')}</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {/* テーマ検索 */}
          <input
            type="search"
            value={themeSearch}
            onChange={e => setThemeSearch(e.target.value)}
            placeholder={t('dashboard.themeSearch')}
            aria-label={t('dashboard.themeSearch')}
            className="min-w-0 max-w-[12rem] rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          {/* テーマ（カテゴリ） */}
          <label htmlFor="theme-select" className="shrink-0 text-sm text-gray-600">{t('dashboard.themeLabel')}</label>
          <select
            id="theme-select"
            value={reportQuery}
            onChange={e => setTheme(e.target.value)}
            className="min-w-0 max-w-full flex-1 truncate rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400 sm:flex-none"
          >
            {(selectableThemes.length > 0 ? selectableThemes : [reportQuery]).map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>

        {/* 表示カードの ON/OFF（SOT-1002 / 提案B 5） */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
          <span className="shrink-0 text-sm text-gray-600">{t('dashboard.cardsLabel')}</span>
          {CARDS.map(card => (
            <label key={card.id} className="flex items-center gap-1.5 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={isCardVisible(card.id)}
                onChange={() => toggleCard(card.id)}
                className="h-3.5 w-3.5 rounded border-gray-300 text-sky-600 focus:ring-sky-400"
              />
              <span className="truncate max-w-[10rem]">{card.label}</span>
            </label>
          ))}
        </div>

        {/* 表示年レンジ選択（論文件数・時価総額・クロス分析グラフに反映） */}
        {showYearRange && (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="shrink-0 text-sm text-gray-600">{t('dashboard.yearRangeLabel')}</span>
            <label htmlFor="year-from-select" className="sr-only">{t('dashboard.yearFrom')}</label>
            <select
              id="year-from-select"
              value={effStart ?? ''}
              onChange={e => {
                const v = Number(e.target.value)
                setYearRange(v, effEnd != null && v > effEnd ? v : effEnd)
              }}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="shrink-0 text-sm text-gray-500">–</span>
            <label htmlFor="year-to-select" className="sr-only">{t('dashboard.yearTo')}</label>
            <select
              id="year-to-select"
              value={effEnd ?? ''}
              onChange={e => {
                const v = Number(e.target.value)
                setYearRange(effStart != null && v < effStart ? v : effStart, v)
              }}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}

        {/* 指数の基準年選択（クロス分析グラフに反映, SOT-1014） */}
        {isCardVisible('cross') && baseYearOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <label htmlFor="base-year-select" className="shrink-0 text-sm text-gray-600">{t('dashboard.baseYearLabel')}</label>
            <select
              id="base-year-select"
              value={effectiveBaseYear ?? ''}
              onChange={e => setBaseYear(Number(e.target.value))}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              {baseYearOptions.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        )}

        {/* グラフ③ クロス分析（論文 × 時価総額） */}
        {isCardVisible('cross') && (
        <ChartCard
          title={t('chart.cross.title')}
          subtitle={`${t('dashboard.themeLabel')}: ${reportQuery}`}
        >
          {isCrossLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
              <p>{t('chart.papers.loading')}</p>
            </div>
          ) : (
            <PapersMarketCapCrossChart counts={filteredPaperCounts} marketCap={filteredMarketCapYearly} baseYear={effectiveBaseYear ?? undefined} />
          )}
        </ChartCard>
        )}

        {/* グラフ① 論文件数（大カテゴリ駆動: その中のカテゴリ=テーマごとの折れ線, SOT-1081 要件③④） */}
        {isCardVisible('papers') && (
        <ChartCard
          title={t('chart.papers.title')}
          subtitle={`${t('dashboard.categoryLabel')}: ${effectiveCategory || t('dashboard.allCategories')}${
            effStart != null && effEnd != null ? ` / ${effStart}–${effEnd}` : ''
          }`}
        >
          {effectiveCategory ? (
            categoryPaperCounts && categoryPaperCounts.series.length > 0 ? (
              <CategoryPaperCountsChart data={categoryPaperCounts} fromYear={effStart} toYear={effEnd} />
            ) : (isCatPapersLoading || isCatPapersFetching) && !categoryPaperCounts ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
                <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
                <p>{t('chart.papers.loading')}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
                <p>{t('chart.papers.empty')}</p>
                <Link to="/research-seeds" className="mt-2 text-sky-600 hover:underline">{t('chart.papers.emptyCta')}</Link>
              </div>
            )
          ) : filteredPaperCounts.length > 0 ? (
            <PapersCountChart counts={filteredPaperCounts} />
          ) : isPapersLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
              <p>{t('chart.papers.loading')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <p>{t('chart.papers.empty')}</p>
              <Link to="/research-seeds" className="mt-2 text-sky-600 hover:underline">{t('chart.papers.emptyCta')}</Link>
            </div>
          )}
        </ChartCard>
        )}

        {/* グラフ① -2 カテゴリグループ別 平均論文数（テーマあたり, SOT-1049） */}
        {isCardVisible('categoryAvg') && (
        <ChartCard
          title={t('chart.categoryAvg.title')}
          subtitle={t('chart.categoryAvg.subtitle')}
        >
          {categoryAverages ? (
            <CategoryAvgPapersChart data={categoryAverages} fromYear={effStart} toYear={effEnd} />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
              <p>{t('chart.categoryAvg.loading')}</p>
            </div>
          )}
        </ChartCard>
        )}

        {/* グラフ② 上位10社時価総額合計 */}
        {isCardVisible('marketCap') && (
        <ChartCard
          title={t('chart.topMarketCap.title', { n: TOP_N })}
          subtitle={t('chart.topMarketCap.subtitle')}
        >
          <TopMarketCapChart data={filteredMarketCapByCompanyData} series={marketCapByCompany.series} />
        </ChartCard>
        )}

        {/* マトリクス テーマ別 引用数（テーマ × 年） */}
        {isCardVisible('matrix') && (
        <ChartCard
          title={t('chart.citationMatrix.title')}
          subtitle={`${t('chart.citationMatrix.subtitle')}${effectiveCategory ? ` / ${t('dashboard.categoryLabel')}: ${effectiveCategory}` : ''}`}
        >
          {displayCitationMatrix ? (
            <ThemeCitationMatrix data={displayCitationMatrix} />
          ) : (
            <p className="text-sm text-gray-400">{t('chart.citationMatrix.loading')}</p>
          )}
        </ChartCard>
        )}
      </section>

      <p className="text-xs text-gray-400 border-t pt-4">
        {t('dashboard.disclaimer')}
      </p>
    </div>
  )
}
