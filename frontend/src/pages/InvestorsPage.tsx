import { useQuery } from '@tanstack/react-query'
import { fetchInvestors } from '../api'
import ChartCard from '../components/charts/ChartCard'
import InvestorHoldingsPie from '../components/charts/InvestorHoldingsPie'
import HoldingsValueTrendLines from '../components/charts/HoldingsValueTrendLines'
import { formatCompact } from '../components/charts/chartUtils'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

export default function InvestorsPage() {
  const { t } = useI18n()

  // 機関投資家(SEC 13F 実データ)の保有。投資家ごとの円グラフのみ表示する（SOT-1146）。
  const { data: investors, isLoading, error } = useQuery({
    queryKey: ['investors'],
    queryFn: fetchInvestors,
    staleTime: 1000 * 60 * 30,
  })

  if (isLoading) return <DashboardLoading />
  if (error) return <DashboardError />

  const allInvestors = investors ?? []
  const companyKey = (inv: typeof allInvestors[number]) => inv.company_name ?? inv.company_id
  const sliceValue = (inv: typeof allInvestors[number]) => inv.value_usd ?? inv.ownership_pct

  // (投資家×企業) ごとに最新報告日のみを採用する。
  const latestByPair = new Map<string, typeof allInvestors[number]>()
  for (const inv of allInvestors) {
    const key = `${inv.investor_name}__${companyKey(inv)}`
    const cur = latestByPair.get(key)
    if (!cur || inv.report_date > cur.report_date) latestByPair.set(key, inv)
  }

  // 投資家ごとに保有企業の内訳（円グラフ用）を集計する。
  const byInvestor = new Map<string, { company: string; value: number }[]>()
  for (const inv of latestByPair.values()) {
    const list = byInvestor.get(inv.investor_name) ?? []
    list.push({ company: companyKey(inv), value: sliceValue(inv) })
    byInvestor.set(inv.investor_name, list)
  }

  // 保有額合計の大きい投資家から並べる。
  const investorCharts = [...byInvestor.entries()]
    .map(([investor, slices]) => ({
      investor,
      slices,
      total: slices.reduce((sum, s) => sum + s.value, 0),
    }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('investors.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('investors.byInvestor.subtitle')}</p>
      </div>

      {investorCharts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('investors.noInstitutional')}</p>
      ) : (
        <div className="space-y-8">
          {/* SOT-1201: 投資家ごとに円グラフ(構成比)と線グラフ(保有額の推移)を1組にまとめ、
              PCでは横並び・スマホでは縦積みで表示する。線グラフはSOT-1187で投資家ごと独立Y軸。 */}
          {investorCharts.map(({ investor, slices, total }) => (
            <section key={investor} className="space-y-3">
              <h2 className="text-lg font-semibold text-foreground">{investor}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ChartCard
                  title={t('investors.byInvestor.title')}
                  subtitle={`${t('investors.byInvestor.total')}: $${formatCompact(total)}`}
                >
                  <InvestorHoldingsPie data={slices} />
                </ChartCard>
                <ChartCard title={t('investors.valueTrend.title')}>
                  <HoldingsValueTrendLines rows={allInvestors.filter(inv => inv.investor_name === investor)} />
                </ChartCard>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
