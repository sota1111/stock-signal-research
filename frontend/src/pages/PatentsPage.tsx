import ScoreBadge from '../components/ScoreBadge'
import ChartCard from '../components/charts/ChartCard'
import { useDashboardQuery } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'

const J_PLATPAT_URL = 'https://www.j-platpat.inpit.go.jp/'

function googlePatentsUrl(query: string) {
  return `https://patents.google.com/?q=${encodeURIComponent(query)}`
}

export default function PatentsPage() {
  const { data, isLoading, error } = useDashboardQuery()

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">特許</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          注目テーマ・キーワードごとの特許動向（論文と並ぶ前兆指標）。各テーマから特許検索へ移動できます。
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">注目テーマの特許検索</h2>
          <p className="text-sm text-gray-500">
            各テーマについて Google Patents・J-PlatPat（特許情報プラットフォーム）で特許を調査できます。
          </p>
        </div>
        {data.trending_themes.length === 0 ? (
          <p className="text-sm text-gray-400">注目テーマがまだありません。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.trending_themes.map(theme => (
              <div key={theme.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{theme.name}</p>
                    <p className="text-xs text-gray-500">{theme.category}</p>
                  </div>
                  <ScoreBadge score={theme.precursor_score} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <a
                    href={googlePatentsUrl(theme.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:underline text-sm"
                  >
                    Google Patents →
                  </a>
                  <a
                    href={J_PLATPAT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 hover:underline text-sm"
                  >
                    J-PlatPat →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <ChartCard
          title="キーワード別 特許検索"
          subtitle="急増キーワードから関連特許を調査します（Google Patents）。"
        >
          {data.top_keywords.length === 0 ? (
            <p className="text-sm text-gray-400">キーワードがまだありません。</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.top_keywords.map(k => (
                <a
                  key={k.keyword}
                  href={googlePatentsUrl(k.keyword)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 hover:text-sky-600"
                  title={k.theme_name ? `テーマ: ${k.theme_name}` : undefined}
                >
                  {k.keyword}
                  <span aria-hidden className="text-sky-600">→</span>
                </a>
              ))}
            </div>
          )}
        </ChartCard>
      </section>
    </div>
  )
}
