import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchSignalReport, fetchThemeCitations } from '../api'
import ChartCard from '../components/charts/ChartCard'
import ThemeCitationsList from '../components/ThemeCitationsList'
import PapersVsPriceComposed from '../components/charts/PapersVsPriceComposed'
import { useDashboardQuery, useTickerStocks } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'

export default function PapersPage() {
  const [selectedTheme, setSelectedTheme] = useState<string>('')
  const { data, isLoading, error } = useDashboardQuery()
  const { primaryStock } = useTickerStocks(data?.notable_companies ?? [])

  // テーマ選択（C1 の論文件数を切り替える）。未選択時は注目テーマの先頭。
  const reportQuery = selectedTheme || data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', reportQuery],
    queryFn: () => fetchSignalReport(reportQuery),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  // テーマ別 引用数（上位100論文の総引用数）
  const { data: themeCitations } = useQuery({
    queryKey: ['theme-citations'],
    queryFn: () => fetchThemeCitations(100),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">論文</h1>
        <p className="text-sm text-gray-500 mt-0.5">テーマ別の引用数と、論文件数 × 株価のクロス分析</p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">テーマ別 引用数（上位100論文の総引用数）</h2>
          <p className="text-sm text-gray-500">各テーマで引用数の多い順に上位100論文を集計。リンク・概要・引用数を表示します。</p>
        </div>
        <ThemeCitationsList themes={themeCitations?.themes ?? []} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">論文 × 株価 クロス分析</h2>
        <ChartCard
          title="C1. 論文件数 vs 株価（2軸）"
          subtitle={`論文件数（棒・左軸）× 年末株価（線・右軸）${primaryStock ? ` / ${primaryStock.name}` : ''}`}
        >
          <div className="mb-3 flex items-center gap-2 min-w-0">
            <label htmlFor="papers-theme-select" className="shrink-0 text-sm text-gray-600">テーマ</label>
            <select
              id="papers-theme-select"
              value={reportQuery}
              onChange={e => setSelectedTheme(e.target.value)}
              className="min-w-0 max-w-full flex-1 truncate rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400 sm:flex-none"
            >
              {(data.trending_themes.length > 0 ? data.trending_themes.map(t => t.name) : [reportQuery]).map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          {(signalReport?.paper_counts_by_year ?? []).length > 0 ? (
            <PapersVsPriceComposed
              counts={signalReport?.paper_counts_by_year ?? []}
              stock={primaryStock?.stock}
              companyName={primaryStock?.name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
              <p>論文データがありません。</p>
              <Link to="/research-seeds" className="mt-2 text-sky-600 hover:underline">初期リサーチを実行する →</Link>
            </div>
          )}
        </ChartCard>
      </section>
    </div>
  )
}
