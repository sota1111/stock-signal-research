import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchSignalReport, fetchThemeCitationMatrix, fetchCategoryPaperAverages, fetchCategoryPaperCounts, fetchInvestors, fetchSupplyChain, fetchExternalInfos } from '../api'
import type { SupplyChainGraphNode, SupplyChainGraphEdge } from '../types'
import { useFilters } from '../contexts/useFilters'
import ChartCard from '../components/charts/ChartCard'
import PapersCountChart from '../components/charts/PapersCountChart'
import CategoryAvgPapersChart from '../components/charts/CategoryAvgPapersChart'
import CategoryPaperCountsChart from '../components/charts/CategoryPaperCountsChart'
import TopMarketCapChart from '../components/charts/TopMarketCapChart'
import PapersMarketCapCrossChart from '../components/charts/PapersMarketCapCrossChart'
import ResearchToPerformanceChart from '../components/charts/ResearchToPerformanceChart'
import RnDIntensityScatter from '../components/charts/RnDIntensityScatter'
import SmartMoneyFlowBar from '../components/charts/SmartMoneyFlowBar'
import HoldingsTrendLines from '../components/charts/HoldingsTrendLines'
import SupplyChainGraphView from '../components/charts/SupplyChainGraphView'
import EvidenceTimeline from '../components/charts/EvidenceTimeline'
import ThemeCitationMatrix from '../components/ThemeCitationMatrix'
import DataProvenanceBadge, { DataProvenanceLegend } from '../components/DataProvenanceBadge'
import { useDashboardQuery, useAllThemes, useTickerStocks, useTickerFundamentals, filterCompaniesByCategory, buildTopMarketCapYearly, buildTopMarketCapCompanyYearly, buildResearchPerformanceSeries, buildRnDIntensityPoints, GRAPH_FROM_YEAR } from './dashboardData'
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

  // 大カテゴリ選択・テーマ検索・カード表示ON/OFF の UI 状態（SOT-1002 / 提案B 3・5）。
  const [category, setCategory] = useState('')
  const [themeSearch, setThemeSearch] = useState('')
  const [hiddenCards, setHiddenCards] = useState<Record<string, boolean>>({})
  // クロス分析（指数）の基準年。null = 自動（両系列が正の最初の共通年）。SOT-1014
  const [baseYear, setBaseYear] = useState<number | null>(null)

  // テーマ選択（選択でグラフが切り替わる）。未選択時は注目テーマの先頭。
  const reportQuery = selectedTheme || data?.trending_themes?.[0]?.name || 'AI'
  // 選択肢ユニバース（全テーマ）と、論文/時価総額カードを駆動する大カテゴリ。
  const queryThemes = (allThemes && allThemes.length > 0 ? allThemes : data?.trending_themes) ?? []
  const queryCategory = category || queryThemes.find(th => th.name === reportQuery)?.category || ''

  // 時価総額上位10社は選択中の大カテゴリの企業に絞る（SOT-1081 要件⑤）。未選択時は全注目企業。
  const scopedCompanies = filterCompaniesByCategory(data?.notable_companies ?? [], queryCategory, queryThemes)
  const { stockItems, stockQueries } = useTickerStocks(scopedCompanies)

  // SOT-1128: クロス分析（論文×時価総額）の時価総額系列を、カテゴリ絞り込みで時価総額が
  // 空のときだけ全注目企業の上位N社にフォールバックさせる。これにより、時価総額データを持つ
  // 企業が居ない大カテゴリ/テーマ（例: ユーザー登録の「エネルギー」/「リチウムイオンバッテリー」）
  // でも、選択テーマに論文があればクロス分析グラフが描画される。専用「上位N社時価総額」カードは
  // 従来通り scoped のまま（フォールバックしない）。
  // hooks 数を一定に保つため、フォールバック用の useTickerStocks は必ずローディングガードより前に呼ぶ。
  const TOP_N = 10
  const scopedMarketCapYearly = buildTopMarketCapYearly(stockItems, TOP_N)
  // scoped クエリが全て決着済み（loading でも fetching でもない）か。scopedCompanies が空なら
  // stockQueries は空配列 → every は true（=「ティッカー企業が居ない」ケースで即フォールバック有効化）。
  const scopedSettled = stockQueries.every(q => !q.isLoading && !q.isFetching)
  // 大カテゴリ選択中 かつ scoped 時価総額が空 のときだけグローバル・フォールバックを取得する。
  // 全カテゴリ（未選択）時は元々全企業なのでフォールバック不要。
  const needGlobalMarketCap = !!queryCategory && scopedSettled && scopedMarketCapYearly.length === 0
  const { stockItems: globalStockItems, stockQueries: globalStockQueries } = useTickerStocks(
    data?.notable_companies ?? [],
    { enabled: needGlobalMarketCap },
  )
  const globalMarketCapYearly = buildTopMarketCapYearly(globalStockItems, TOP_N)
  // クロス分析が使う実効時価総額系列: scoped があればそれ、無ければグローバルにフォールバック。
  const crossMarketCapYearly =
    scopedMarketCapYearly.length > 0 ? scopedMarketCapYearly : globalMarketCapYearly

  // 財務ファンダメンタルズ（SOT-1126 子1 / G1・G2）。選択中の大カテゴリに属する企業（未選択時は全注目企業）
  // の財務時系列を per-ticker で取得し、研究→業績連鎖（集計）と R&D集約度散布図を描く。
  // hooks 数を一定に保つためガード(return)より前で呼ぶ。
  const { items: fundamentalsItems, queries: fundamentalsQueries } = useTickerFundamentals(scopedCompanies)
  const researchPerformance = buildResearchPerformanceSeries(fundamentalsItems)
  const rndIntensityPoints = buildRnDIntensityPoints(fundamentalsItems, stockItems)
  const isFundamentalsLoading =
    fundamentalsQueries.some(q => q.isLoading || q.isFetching) && researchPerformance.length === 0

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

  // 論文カードは大カテゴリ選択で駆動する（SOT-1081 要件③④）。選択中の大カテゴリ内の
  // テーマごとの年別論文数を取得する（queryCategory は上で算出済み）。
  const { data: categoryPaperCounts, isLoading: isCatPapersLoading, isFetching: isCatPapersFetching } = useQuery({
    queryKey: ['category-paper-counts', queryCategory, PAPER_HISTORY_FROM_YEAR],
    queryFn: () => fetchCategoryPaperCounts(queryCategory, PAPER_HISTORY_FROM_YEAR),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data && !!queryCategory,
  })

  // 機関投資家（13F 実データ）— G3 スマートマネー・フロー / G4 保有推移（SOT-1126 子2）。
  const { data: investorsData } = useQuery({
    queryKey: ['investors'],
    queryFn: fetchInvestors,
    staleTime: 1000 * 60 * 30,
    enabled: !!data,
  })

  // サプライチェーン依存関係（G5, SOT-1126 子3）。大カテゴリ選択時はカテゴリで、未選択時は選択テーマで絞る。
  const selectedThemeId = queryThemes.find(th => th.name === reportQuery)?.id ?? ''
  const { data: supplyChainEdges } = useQuery({
    queryKey: ['supply-chain', 'dashboard', queryCategory, selectedThemeId],
    queryFn: () =>
      fetchSupplyChain(
        queryCategory ? { category: queryCategory } : selectedThemeId ? { theme_id: selectedThemeId } : undefined,
      ),
    staleTime: 1000 * 60 * 10,
    enabled: !!data,
  })

  // 最新エビデンス横断フィード（G6, SOT-1126 子4）。全テーマ横断の最新の動きを取得する。
  const { data: externalInfos } = useQuery({
    queryKey: ['external-infos', 'dashboard-latest'],
    queryFn: () => fetchExternalInfos({ limit: 50 }),
    staleTime: 1000 * 60 * 30,
    enabled: !!data,
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
  // クロス分析が使う時価総額系列（SOT-1128: scoped 空ならグローバルにフォールバック）。
  const marketCapYearly = crossMarketCapYearly
  // クロス分析の時価総額がまだ無く、scoped かフォールバックのどちらかが取得中ならローディング扱い。
  const isMarketCapLoading =
    marketCapYearly.length === 0 &&
    (stockQueries.some(q => q.isLoading || q.isFetching) ||
      (needGlobalMarketCap && globalStockQueries.some(q => q.isLoading || q.isFetching)))
  // クロス分析カードは論文・時価総額の両系列に依存する。どちらかが取得中の間は
  // 空表示ではなくローディングを出す（テーマ切替時のバックグラウンド再取得を含む, SOT-1055 / SOT-1128）。
  const isCrossLoading =
    isReportLoading ||
    isReportFetching ||
    stockQueries.some(q => q.isLoading || q.isFetching) ||
    (needGlobalMarketCap && globalStockQueries.some(q => q.isLoading || q.isFetching)) ||
    isMarketCapLoading
  // 上位N社時価総額カードは従来通りカテゴリ絞り込み（scoped）のまま（SOT-1081 ⑤）。
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
  // G1: 研究→業績連鎖は年レンジ選択にも追随させる（散布図 G2 は最新年スナップショットなので非追随）。
  const filteredResearchPerformance = researchPerformance.filter(r => inRange(r.year))
  const showYearRange = availableYears.length > 1 && effStart != null && effEnd != null

  // === 13F 機関投資家（G3 スマートマネー・フロー / G4 保有推移, SOT-1126 子2） ===
  // 選択中の大カテゴリに属する企業（scopedCompanies）に 13F 行を絞る。ticker 一致を優先し company_name で補完。
  const scopedTickers = new Set(scopedCompanies.map(c => c.ticker).filter(Boolean) as string[])
  const scopedNames = new Set(scopedCompanies.map(c => c.name))
  const allInvestors = investorsData ?? []
  const scopedInvestors = queryCategory
    ? allInvestors.filter(inv => (inv.ticker && scopedTickers.has(inv.ticker)) || (inv.company_name != null && scopedNames.has(inv.company_name)))
    : allInvestors
  const investorCompanyKey = (inv: (typeof allInvestors)[number]) => inv.company_name ?? inv.ticker ?? ''
  // G3: (投資家×企業) ごとの最新報告の四半期Δを企業単位で合計し、増減の発散棒にする。
  const latestInvestorByPair = new Map<string, (typeof allInvestors)[number]>()
  for (const inv of scopedInvestors) {
    const key = `${inv.investor_name}__${investorCompanyKey(inv)}`
    const cur = latestInvestorByPair.get(key)
    if (!cur || inv.report_date > cur.report_date) latestInvestorByPair.set(key, inv)
  }
  const smartMoneyDeltaByCompany = new Map<string, number>()
  for (const inv of latestInvestorByPair.values()) {
    if (inv.quarter_delta != null && inv.quarter_delta !== 0) {
      const co = investorCompanyKey(inv)
      smartMoneyDeltaByCompany.set(co, (smartMoneyDeltaByCompany.get(co) ?? 0) + inv.quarter_delta)
    }
  }
  const smartMoneyFlow = [...smartMoneyDeltaByCompany.entries()]
    .filter(([, d]) => d !== 0)
    .map(([name, delta]) => ({ name, delta }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 12)
  // G4: 報告期が最も多い企業を保有推移の対象にする（複数期あるほど推移が見える）。
  const investorDatesByCompany = new Map<string, Set<string>>()
  for (const inv of scopedInvestors) {
    const co = investorCompanyKey(inv)
    const s = investorDatesByCompany.get(co) ?? new Set<string>()
    s.add(inv.report_date)
    investorDatesByCompany.set(co, s)
  }
  let holdingsCompany = ''
  let holdingsDates = 0
  for (const [co, s] of investorDatesByCompany) {
    if (s.size > holdingsDates) {
      holdingsDates = s.size
      holdingsCompany = co
    }
  }
  const holdingsRows = scopedInvestors.filter(inv => investorCompanyKey(inv) === holdingsCompany)

  // === サプライチェーン依存関係グラフ（G5, SOT-1126 子3） ===
  // 構造化 edge（SupplyChainItem[]）を node.type=大カテゴリ で色分けする nodes/edges に変換。
  // 円形レイアウトが破綻しないよう edge 数を上限で抑える。
  const SC_MAX_EDGES = 24
  const cappedScEdges = (supplyChainEdges ?? []).slice(0, SC_MAX_EDGES)
  const scNodeMap = new Map<string, SupplyChainGraphNode>()
  const scGraphEdges: SupplyChainGraphEdge[] = []
  for (const e of cappedScEdges) {
    if (!scNodeMap.has(e.from_theme_id)) {
      scNodeMap.set(e.from_theme_id, { id: e.from_theme_id, type: e.from_category ?? 'theme', label: e.from_theme_name ?? e.from_theme_id })
    }
    if (!scNodeMap.has(e.to_theme_id)) {
      scNodeMap.set(e.to_theme_id, { id: e.to_theme_id, type: e.to_category ?? 'theme', label: e.to_theme_name ?? e.to_theme_id })
    }
    scGraphEdges.push({ source: e.from_theme_id, target: e.to_theme_id, relation: e.relation_type, evidence: e.evidence ?? [] })
  }
  const scNodes = [...scNodeMap.values()]

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
    { id: 'research', label: t('chart.research.title') },
    { id: 'rndScatter', label: t('chart.rndScatter.title') },
    { id: 'categoryAvg', label: t('chart.categoryAvg.title') },
    { id: 'marketCap', label: t('chart.topMarketCap.title', { n: TOP_N }) },
    { id: 'smartMoney', label: t('chart.smartMoney.title') },
    { id: 'holdings', label: t('chart.holdings.title') },
    { id: 'supplyChain', label: t('chart.supplyChainPanel.title') },
    { id: 'evidence', label: t('chart.evidence.title') },
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
          actions={<DataProvenanceBadge kind="approx" note={t('provenance.cross.note')} asOf={lastAnalyzed} />}
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
          actions={<DataProvenanceBadge kind="measured" scope={t('provenance.scope.allThemes')} asOf={lastAnalyzed} />}
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

        {/* G1 研究→業績 連鎖チャート（財務ファンダメンタルズ集計, SOT-1126 子1） */}
        {isCardVisible('research') && (
        <ChartCard
          title={t('chart.research.title')}
          subtitle={`${t('chart.research.subtitle')}${effectiveCategory ? ` / ${t('dashboard.categoryLabel')}: ${effectiveCategory}` : ''}`}
          actions={<DataProvenanceBadge kind="measured" scope={t('provenance.scope.usMostly')} asOf={lastAnalyzed} />}
        >
          {isFundamentalsLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
              <p>{t('chart.research.loading')}</p>
            </div>
          ) : (
            <ResearchToPerformanceChart data={filteredResearchPerformance} />
          )}
        </ChartCard>
        )}

        {/* G2 R&D集約度 散布図（SOT-1126 子1） */}
        {isCardVisible('rndScatter') && (
        <ChartCard
          title={t('chart.rndScatter.title')}
          subtitle={`${t('chart.rndScatter.subtitle')}${effectiveCategory ? ` / ${t('dashboard.categoryLabel')}: ${effectiveCategory}` : ''}`}
          actions={<DataProvenanceBadge kind="approx" scope={t('provenance.scope.usMostly')} asOf={lastAnalyzed} />}
        >
          {isFundamentalsLoading ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
              <p>{t('chart.research.loading')}</p>
            </div>
          ) : (
            <RnDIntensityScatter points={rndIntensityPoints} />
          )}
        </ChartCard>
        )}

        {/* グラフ① -2 カテゴリグループ別 平均論文数（テーマあたり, SOT-1049） */}
        {isCardVisible('categoryAvg') && (
        <ChartCard
          title={t('chart.categoryAvg.title')}
          subtitle={t('chart.categoryAvg.subtitle')}
          actions={<DataProvenanceBadge kind="measured" scope={t('provenance.scope.allCategories')} />}
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
          subtitle={`${t('chart.topMarketCap.subtitle')}${effectiveCategory ? ` / ${t('dashboard.categoryLabel')}: ${effectiveCategory}` : ''}`}
          actions={<DataProvenanceBadge kind="approx" scope={t('provenance.scope.usMostly')} />}
        >
          <TopMarketCapChart data={filteredMarketCapByCompanyData} series={marketCapByCompany.series} />
        </ChartCard>
        )}

        {/* G3 スマートマネー・フロー（13F 最新四半期Δ, SOT-1126 子2） */}
        {isCardVisible('smartMoney') && (
        <ChartCard
          title={t('chart.smartMoney.title')}
          subtitle={`${t('chart.smartMoney.subtitle')}${effectiveCategory ? ` / ${t('dashboard.categoryLabel')}: ${effectiveCategory}` : ''}`}
          actions={<DataProvenanceBadge kind="measured" scope={t('provenance.scope.usMostly')} asOf={lastAnalyzed} />}
        >
          <SmartMoneyFlowBar items={smartMoneyFlow} />
        </ChartCard>
        )}

        {/* G4 機関投資家 保有推移（13F, SOT-1126 子2） */}
        {isCardVisible('holdings') && (
        <ChartCard
          title={t('chart.holdings.title')}
          subtitle={`${t('chart.holdings.subtitle')}${holdingsCompany ? ` / ${holdingsCompany}` : ''}`}
          actions={<DataProvenanceBadge kind="measured" scope={t('provenance.scope.usMostly')} asOf={lastAnalyzed} />}
        >
          <HoldingsTrendLines rows={holdingsRows} />
        </ChartCard>
        )}

        {/* G5 サプライチェーン依存関係ネットワーク（SOT-1126 子3） */}
        {isCardVisible('supplyChain') && (
        <ChartCard
          title={t('chart.supplyChainPanel.title')}
          subtitle={`${t('chart.supplyChainPanel.subtitle')}${effectiveCategory ? ` / ${t('dashboard.categoryLabel')}: ${effectiveCategory}` : ` / ${reportQuery}`}`}
          actions={<DataProvenanceBadge kind="measured" scope={t('provenance.scope.allThemes')} />}
        >
          <SupplyChainGraphView nodes={scNodes} edges={scGraphEdges} />
        </ChartCard>
        )}

        {/* G6 最新エビデンス・タイムライン（全テーマ横断, SOT-1126 子4） */}
        {isCardVisible('evidence') && (
        <ChartCard
          title={t('chart.evidence.title')}
          subtitle={t('chart.evidence.subtitle')}
          actions={<DataProvenanceBadge kind="measured" scope={t('provenance.scope.allThemes')} />}
        >
          <EvidenceTimeline items={externalInfos ?? []} />
        </ChartCard>
        )}

        {/* マトリクス テーマ別 引用数（テーマ × 年） */}
        {isCardVisible('matrix') && (
        <ChartCard
          title={t('chart.citationMatrix.title')}
          subtitle={`${t('chart.citationMatrix.subtitle')}${effectiveCategory ? ` / ${t('dashboard.categoryLabel')}: ${effectiveCategory}` : ''}`}
          actions={<DataProvenanceBadge kind="measured" scope={t('provenance.scope.allThemes')} />}
        >
          {displayCitationMatrix ? (
            <ThemeCitationMatrix data={displayCitationMatrix} />
          ) : (
            <p className="text-sm text-gray-400">{t('chart.citationMatrix.loading')}</p>
          )}
        </ChartCard>
        )}
      </section>

      <div className="border-t pt-4 space-y-2">
        <DataProvenanceLegend />
        <p className="text-xs text-gray-400">
          {t('dashboard.disclaimer')}
        </p>
      </div>
    </div>
  )
}
