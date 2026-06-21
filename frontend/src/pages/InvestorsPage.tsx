import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSignalReport, fetchInvestors } from '../api'
import ScoreBadge from '../components/ScoreBadge'
import ChartCard from '../components/charts/ChartCard'
import SupplyChainGraphView from '../components/charts/SupplyChainGraphView'
import { useDashboardQuery } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

export default function InvestorsPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useDashboardQuery()
  const [latestOnly, setLatestOnly] = useState(true)

  // サプライチェーン連鎖図（C2）用。注目テーマの先頭を対象にする。
  const reportQuery = data?.trending_themes?.[0]?.name || 'AI'
  const { data: signalReport } = useQuery({
    queryKey: ['signal-report', reportQuery],
    queryFn: () => fetchSignalReport(reportQuery),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  // 機関投資家(SEC 13F 実データ)の保有。過去約10年・四半期の保有推移。
  const { data: investors } = useQuery({
    queryKey: ['investors'],
    queryFn: fetchInvestors,
    staleTime: 1000 * 60 * 30,
  })

  // latestOnly のときは (投資家×企業) ごとに最新報告日のみに絞る。
  const allInvestors = investors ?? []
  const latestByPair = new Map<string, typeof allInvestors[number]>()
  for (const inv of allInvestors) {
    const key = `${inv.investor_name}__${inv.company_name ?? inv.company_id}`
    const cur = latestByPair.get(key)
    if (!cur || inv.report_date > cur.report_date) latestByPair.set(key, inv)
  }
  const investorRows = (latestOnly ? Array.from(latestByPair.values()) : allInvestors)
    .slice()
    .sort((a, b) =>
      a.investor_name === b.investor_name
        ? b.report_date.localeCompare(a.report_date)
        : a.investor_name.localeCompare(b.investor_name),
    )

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('investors.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t('investors.subtitle')}</p>
      </div>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="text-lg font-semibold text-gray-700">{t('investors.institutional')}</h2>
          {allInvestors.length > 0 && (
            <button
              onClick={() => setLatestOnly(v => !v)}
              className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              {latestOnly ? t('investors.showAll') : t('investors.latestOnly')}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-3">{t('investors.institutional.subtitle')}</p>
        {investorRows.length === 0 ? (
          <p className="text-sm text-gray-400">{t('investors.noInstitutional')}</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">{t('list.col.investorName')}</th>
                  <th className="px-4 py-2 text-left">{t('investors.col.company')}</th>
                  <th className="px-4 py-2 text-right">{t('list.col.ownership')}</th>
                  <th className="px-4 py-2 text-right">{t('list.col.change')}</th>
                  <th className="px-4 py-2 text-left">{t('list.col.reportDate')}</th>
                  <th className="px-4 py-2 text-left">{t('investors.col.shares')}</th>
                </tr>
              </thead>
              <tbody>
                {investorRows.map(inv => (
                  <tr key={inv.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium" data-label={t('list.col.investorName')}>{inv.investor_name}</td>
                    <td className="px-4 py-2" data-label={t('investors.col.company')}>{inv.company_name ?? '-'}</td>
                    <td className="px-4 py-2 text-right" data-label={t('list.col.ownership')}>{inv.ownership_pct.toFixed(2)}%</td>
                    <td className={`px-4 py-2 text-right ${inv.change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`} data-label={t('list.col.change')}>
                      {inv.change_pct >= 0 ? '+' : ''}{inv.change_pct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 text-gray-500" data-label={t('list.col.reportDate')}>{inv.report_date}</td>
                    <td className="px-4 py-2 text-gray-500" data-label={t('investors.col.shares')}>{inv.notes ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">{t('investors.top5')}</h2>
        {data.notable_companies.length === 0 ? (
          <p className="text-sm text-gray-400">{t('investors.noCompanies')}</p>
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
                        {company.benefit_type === 'direct' ? t('investors.benefit.direct') : t('investors.benefit.indirect')}
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
        <h2 className="text-lg font-semibold text-gray-700 mb-3">{t('investors.supplyChain')}</h2>
        <div className="bg-white rounded-lg shadow p-4">
          {data.supply_chain_highlights.length === 0 ? (
            <p className="text-sm text-gray-400">{t('investors.noChain')}</p>
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
        <ChartCard title={t('investors.chainChart.title')} subtitle={t('investors.chainChart.subtitle')}>
          <SupplyChainGraphView
            nodes={signalReport?.supply_chain_graph?.nodes ?? []}
            edges={signalReport?.supply_chain_graph?.edges ?? []}
          />
        </ChartCard>
      </section>
    </div>
  )
}
