import { useQuery } from '@tanstack/react-query'
import { fetchDashboard, fetchSignalReport, fetchMonthlyData } from '../api'
import ScoreBadge from '../components/ScoreBadge'
import ChartCard from '../components/charts/ChartCard'
import PaperCountsByYearBar from '../components/charts/PaperCountsByYearBar'
import MonthlyPapersLine from '../components/charts/MonthlyPapersLine'
import SurgingKeywordsBar from '../components/charts/SurgingKeywordsBar'
import CompanyScoreBar from '../components/charts/CompanyScoreBar'

export default function SignalDetectionPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })

  // 急増テーマTOPを既定queryにシグナルレポートを取得（B系チャート用）
  const reportQuery = data?.trending_themes?.[0]?.name ?? 'AI'
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', reportQuery],
    queryFn: () => fetchSignalReport(reportQuery),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })
  const { data: monthly } = useQuery({
    queryKey: ['papers-monthly'],
    queryFn: () => fetchMonthlyData(),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <span className="h-8 w-8 mb-3 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
      <p className="text-sm">読み込み中...</p>
    </div>
  )
  if (error || !data) return (
    <div className="mx-auto max-w-md text-center py-16">
      <div className="text-3xl mb-2" aria-hidden>⚠️</div>
      <p className="font-semibold text-slate-700">データの取得に失敗しました</p>
      <p className="text-sm text-slate-400 mt-1">時間をおいて再度お試しください。</p>
    </div>
  )

  return (
    <div className="space-y-8">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-800">前兆検知 — 技術トレンド</h1>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">急増テーマ TOP5</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.trending_themes.map(theme => (
            <div key={theme.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold text-gray-800">{theme.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{theme.category}</p>
                </div>
                <ScoreBadge score={theme.precursor_score} />
              </div>
              {theme.is_trending && (
                <span className="mt-2 inline-block text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded">継続トレンド</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {data.alignment_highlights && (data.alignment_highlights.high_alignment?.length > 0 || data.alignment_highlights.paper_only?.length > 0) && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">外部情報との一致度 — 前兆候補</h2>
          <div className="space-y-3">
            {/* High alignment themes */}
            {data.alignment_highlights.high_alignment?.length > 0 && (
              <div>
                <p className="text-xs text-blue-600 font-medium mb-2">論文トレンド + 外部情報一致</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.alignment_highlights.high_alignment.map(item => (
                    <div key={item.theme.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800">{item.theme.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.theme.category}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="block bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            一致度 {item.score.toFixed(0)}
                          </span>
                          <span className="block text-xs text-gray-500">
                            信頼度 {item.confidence >= 0.8 ? '高' : item.confidence >= 0.5 ? '中' : '低'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-blue-700 mt-2">前兆候補</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Paper-only themes */}
            {data.alignment_highlights.paper_only?.length > 0 && (
              <div>
                <p className="text-xs text-orange-600 font-medium mb-2">論文トレンドのみ高い（外部情報との一致度は未確認）</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.alignment_highlights.paper_only.map(item => (
                    <div key={item.theme.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-400">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800">{item.theme.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.theme.category}</p>
                        </div>
                        <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-bold">
                          前兆スコア {item.precursor_score.toFixed(0)}
                        </span>
                      </div>
                      <p className="text-xs text-orange-600 mt-2">関連候補</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">急増キーワード ランキング</h2>
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm responsive-table">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">キーワード</th>
                <th className="px-4 py-2 text-left">テーマ</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">前月比</th>
              </tr>
            </thead>
            <tbody>
              {data.top_keywords.map((kw, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500" data-label="#">{i + 1}</td>
                  <td className="px-4 py-2 font-medium" data-label="キーワード">{kw.keyword}</td>
                  <td className="px-4 py-2 text-gray-600" data-label="テーマ">{kw.theme_name ?? '-'}</td>
                  <td className="px-4 py-2 text-right text-green-600 font-semibold whitespace-nowrap" data-label="前月比">+{kw.mom_change_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === 論文・研究トレンド === */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">論文・研究トレンド</h2>
        <p className="text-xs text-gray-400 -mt-2">集計テーマ: {reportQuery}</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="B1. 年別論文件数（過去10年）">
            <PaperCountsByYearBar data={signalReport?.paper_counts_by_year ?? []} />
          </ChartCard>
          <ChartCard title="B2. 月次論文件数トレンド" subtitle="全テーマ合算">
            <MonthlyPapersLine data={monthly ?? []} />
          </ChartCard>
          <ChartCard title="B3. 急増キーワード" subtitle="成長率 上位10件">
            <SurgingKeywordsBar data={signalReport?.surging_keywords ?? []} />
          </ChartCard>
          <ChartCard title="B4. 注目企業 前兆スコア">
            <CompanyScoreBar data={signalReport?.top_companies ?? []} />
          </ChartCard>
        </div>
      </section>

      <p className="text-xs text-gray-400 border-t pt-4">
        ※ このツールは情報収集・分析支援を目的としています。投資判断は自己責任でお願いします。
      </p>
    </div>
  )
}
