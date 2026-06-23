import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSignalReport, fetchInvestors } from '../api'
import ScoreBadge from '../components/ScoreBadge'
import ChartCard from '../components/charts/ChartCard'
import SupplyChainGraphView from '../components/charts/SupplyChainGraphView'
import HoldingsTrendLines from '../components/charts/HoldingsTrendLines'
import HoldingsConcentrationPie from '../components/charts/HoldingsConcentrationPie'
import { useDashboardQuery } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

export default function InvestorsPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useDashboardQuery()
  const [latestOnly, setLatestOnly] = useState(true)
  // 保有ランキングのフィルタ（投資家/企業）と保有推移の対象企業（SOT-995 /investors-3,1）。
  const [investorFilter, setInvestorFilter] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [trendCompany, setTrendCompany] = useState('')

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
  const companyKey = (inv: typeof allInvestors[number]) => inv.company_name ?? inv.company_id
  const investorRows = (latestOnly ? Array.from(latestByPair.values()) : allInvestors)
    .filter(inv => (!investorFilter || inv.investor_name === investorFilter) && (!companyFilter || companyKey(inv) === companyFilter))
    .slice()
    .sort((a, b) =>
      a.investor_name === b.investor_name
        ? b.report_date.localeCompare(a.report_date)
        : a.investor_name.localeCompare(b.investor_name),
    )

  // フィルタ選択肢
  const investorNames = [...new Set(allInvestors.map(i => i.investor_name))].sort()
  const companyNames = [...new Set(allInvestors.map(companyKey))].sort()

  // 保有集中度（企業別・最新報告の保有比率合計, /investors-4）
  const latestRows = Array.from(latestByPair.values())
  const concentrationMap = new Map<string, number>()
  for (const inv of latestRows) concentrationMap.set(companyKey(inv), (concentrationMap.get(companyKey(inv)) ?? 0) + inv.ownership_pct)
  const concentration = [...concentrationMap.entries()].map(([company, total]) => ({ company, total })).sort((a, b) => b.total - a.total)

  // 投資家 → 企業 関係（最新報告, /investors-2）
  const relationMap = new Map<string, string[]>()
  for (const inv of latestRows) {
    const list = relationMap.get(inv.investor_name) ?? []
    if (!list.includes(companyKey(inv))) list.push(companyKey(inv))
    relationMap.set(inv.investor_name, list)
  }
  const relations = [...relationMap.entries()].map(([investor, companies]) => ({ investor, companies })).sort((a, b) => a.investor.localeCompare(b.investor))

  // 保有推移の対象企業（複数期報告がある企業を既定にする, /investors-1）
  const effTrendCompany = trendCompany || companyNames[0] || ''
  const trendRows = allInvestors.filter(inv => companyKey(inv) === effTrendCompany)

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
        {/* 保有ランキングのフィルタ（SOT-995 /investors-3） */}
        {allInvestors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select
              value={investorFilter}
              onChange={e => setInvestorFilter(e.target.value)}
              aria-label={t('investors.filter.investor')}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="">{t('investors.filter.investor')}: {t('investors.filter.all')}</option>
              {investorNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <select
              value={companyFilter}
              onChange={e => setCompanyFilter(e.target.value)}
              aria-label={t('investors.filter.company')}
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
            >
              <option value="">{t('investors.filter.company')}: {t('investors.filter.all')}</option>
              {companyNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        {investorRows.length === 0 ? (
          <p className="text-sm text-gray-400">{t('investors.noInstitutional')}</p>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-2 text-left">{t('list.col.investorName')}</th>
                  <th className="px-4 py-2 text-left">{t('investors.col.company')}</th>
                  <th className="px-4 py-2 text-left">{t('investors.col.ticker')}</th>
                  <th className="px-4 py-2 text-left">{t('investors.col.cusip')}</th>
                  <th className="px-4 py-2 text-right">{t('investors.col.shares')}</th>
                  <th className="px-4 py-2 text-right">{t('investors.col.value')}</th>
                  <th className="px-4 py-2 text-right">{t('list.col.ownership')}</th>
                  <th className="px-4 py-2 text-right">{t('list.col.change')}</th>
                  <th className="px-4 py-2 text-right">{t('investors.col.quarterDelta')}</th>
                  <th className="px-4 py-2 text-left">{t('list.col.reportDate')}</th>
                </tr>
              </thead>
              <tbody>
                {investorRows.map(inv => (
                  <tr key={inv.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium" data-label={t('list.col.investorName')}>{inv.investor_name}</td>
                    <td className="px-4 py-2" data-label={t('investors.col.company')}>{inv.company_name ?? '-'}</td>
                    <td className="px-4 py-2 text-gray-600" data-label={t('investors.col.ticker')}>{inv.ticker ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs" data-label={t('investors.col.cusip')}>{inv.cusip ?? '—'}</td>
                    <td className="px-4 py-2 text-right" data-label={t('investors.col.shares')}>{inv.shares != null ? inv.shares.toLocaleString() : '—'}</td>
                    <td className="px-4 py-2 text-right text-gray-600" data-label={t('investors.col.value')}>{inv.value_usd != null ? `$${Math.round(inv.value_usd).toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-2 text-right" data-label={t('list.col.ownership')}>{inv.ownership_pct.toFixed(2)}%</td>
                    <td className={`px-4 py-2 text-right ${inv.change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`} data-label={t('list.col.change')}>
                      {inv.change_pct >= 0 ? '+' : ''}{inv.change_pct.toFixed(2)}%
                    </td>
                    <td
                      className={`px-4 py-2 text-right ${inv.quarter_delta == null || inv.quarter_delta === 0 ? 'text-gray-400' : inv.quarter_delta > 0 ? 'text-green-600' : 'text-red-600'}`}
                      data-label={t('investors.col.quarterDelta')}
                    >
                      {inv.quarter_delta == null ? '—' : `${inv.quarter_delta > 0 ? '+' : ''}${inv.quarter_delta.toLocaleString()}`}
                    </td>
                    <td className="px-4 py-2 text-gray-500" data-label={t('list.col.reportDate')}>{inv.report_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 保有推移（四半期） SOT-995 /investors-1 */}
      {allInvestors.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-700">{t('investors.trend.title')}</h2>
              <p className="text-sm text-gray-500">{t('investors.trend.subtitle')}</p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="trend-company" className="shrink-0 text-sm text-gray-600">{t('investors.trend.selectCompany')}</label>
              <select
                id="trend-company"
                value={effTrendCompany}
                onChange={e => setTrendCompany(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                {companyNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <ChartCard title={t('investors.trend.title')} subtitle={effTrendCompany}>
            <HoldingsTrendLines rows={trendRows} />
          </ChartCard>
        </section>
      )}

      {/* 保有集中度（企業別・最新） SOT-995 /investors-4 */}
      {concentration.length > 0 && (
        <section className="space-y-3">
          <ChartCard title={t('investors.concentration.title')} subtitle={t('investors.concentration.subtitle')}>
            <HoldingsConcentrationPie data={concentration} />
          </ChartCard>
        </section>
      )}

      {/* 投資家 → 企業 関係 SOT-995 /investors-2 */}
      {relations.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-700">{t('investors.relation.title')}</h2>
            <p className="text-sm text-gray-500">{t('investors.relation.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {relations.map(r => (
              <div key={r.investor} className="bg-white rounded-lg shadow p-4">
                <p className="font-semibold text-gray-800 mb-2">{r.investor}</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.companies.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => { setCompanyFilter(c); setTrendCompany(c) }}
                      className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-700 hover:bg-sky-100"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
