import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchFundamentalsCompanies, fetchFinancialFundamentals } from '../api'
import ChartCard from '../components/charts/ChartCard'
import FinancialFundamentalsChart from '../components/charts/FinancialFundamentalsChart'
import { PageLoading } from '../components/AsyncState'
import { useI18n } from '../i18n/useI18n'

const CATEGORY_STALE_TIME = 1000 * 60 * 30

export default function IndividualStockPage() {
  const { t } = useI18n()

  // === 財務ファンダメンタルズ時系列（SOT-1121 / 候補D・SEC EDGAR XBRL）===
  // SOT-1178: 株価ページから個別株ページへ移設。
  const { data: fundCompanies, isLoading: isCompaniesLoading } = useQuery({
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('nav.individualStock')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('fundamentals.section.subtitle')}</p>
      </div>

      {/* === 財務ファンダメンタルズ時系列（SOT-1121 / 候補D・SEC EDGAR XBRL） === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('fundamentals.section.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('fundamentals.section.subtitle')}</p>
        </div>
        {isCompaniesLoading ? (
          <PageLoading />
        ) : fundTickers.length === 0 ? (
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
    </div>
  )
}
