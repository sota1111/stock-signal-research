import { useQuery } from '@tanstack/react-query'
import { fetchSignalReport } from '../api'
import ScoreBadge from '../components/ScoreBadge'
import ChartCard from '../components/charts/ChartCard'
import SupplyChainGraphView from '../components/charts/SupplyChainGraphView'
import { useDashboardQuery } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'

export default function InvestorsPage() {
  const { data, isLoading, error } = useDashboardQuery()

  // サプライチェーン連鎖図（C2）用。注目テーマの先頭を対象にする。
  const reportQuery = data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', reportQuery],
    queryFn: () => fetchSignalReport(reportQuery),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">投資家</h1>
        <p className="text-sm text-gray-500 mt-0.5">注目企業と恩恵の連鎖（サプライチェーン）</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">注目企業 TOP5</h2>
        {data.notable_companies.length === 0 ? (
          <p className="text-sm text-gray-400">注目企業がまだありません。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.notable_companies.map(company => (
              <div key={company.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold">{company.name}</p>
                    {company.ticker && <p className="text-xs text-gray-500">{company.ticker}</p>}
                  </div>
                  <div className="text-right">
                    <ScoreBadge score={company.benefit_score} />
                    <p className="text-xs text-gray-500 mt-1">
                      <span className={company.benefit_type === 'direct' ? 'text-blue-600' : 'text-gray-500'}>
                        {company.benefit_type === 'direct' ? '直接恩恵' : '間接恩恵'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">サプライチェーン連鎖</h2>
        <div className="bg-white rounded-lg shadow p-4">
          {data.supply_chain_highlights.length === 0 ? (
            <p className="text-sm text-gray-400">連鎖データがありません。</p>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              {data.supply_chain_highlights.map((item, i) => (
                <span key={item.id} className="flex items-center gap-2">
                  {i === 0 && <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">{item.from_theme_name}</span>}
                  <span className="text-gray-400">→</span>
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">{item.to_theme_name}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <ChartCard title="C2. サプライチェーン連鎖図" subtitle="ノード/エッジ図">
          <SupplyChainGraphView
            nodes={signalReport?.supply_chain_graph?.nodes ?? []}
            edges={signalReport?.supply_chain_graph?.edges ?? []}
          />
        </ChartCard>
      </section>
    </div>
  )
}
