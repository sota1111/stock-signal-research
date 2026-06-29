import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchThemes,
  fetchCompanies,
  fetchFundamentalsCompanies,
  fetchFinancialFundamentals,
} from '../api'
import type { Company } from '../types'
import ChartCard from '../components/charts/ChartCard'
import FinancialFundamentalsChart from '../components/charts/FinancialFundamentalsChart'
import { PageLoading } from '../components/AsyncState'
import { useI18n } from '../i18n/useI18n'

const CATEGORY_STALE_TIME = 1000 * 60 * 30

// SOT-1395: テーマの theme_ids（JSON 文字列配列）を安全にパースする。
function parseThemeIds(raw: string | undefined | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export default function IndividualStockPage() {
  const { t } = useI18n()

  // === SOT-1395: カテゴリ→テーマ→銘柄の3段カスケード ===
  // カテゴリ = Theme.category / テーマ = そのカテゴリのテーマ / 銘柄 = テーマに紐づく企業のティッカー。
  // 選択銘柄のティッカーで既存の財務ファンダメンタルズ（SEC EDGAR XBRL）チャートを表示する。
  const { data: themes, isLoading: isThemesLoading } = useQuery({
    queryKey: ['themes'],
    queryFn: fetchThemes,
    staleTime: CATEGORY_STALE_TIME,
  })
  const { data: companies } = useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
    staleTime: CATEGORY_STALE_TIME,
  })
  // 財務時系列データを持つティッカー集合（チャート可否の判定に使用）。
  const { data: fundCompanies } = useQuery({
    queryKey: ['fundamentals-companies'],
    queryFn: fetchFundamentalsCompanies,
    staleTime: CATEGORY_STALE_TIME,
  })
  const hasDataTickers = useMemo(() => {
    const set = new Set<string>()
    for (const c of fundCompanies?.companies ?? []) {
      if (c.has_data) set.add(c.ticker.toUpperCase())
    }
    return set
  }, [fundCompanies])

  const allThemes = useMemo(() => themes ?? [], [themes])

  // カテゴリ一覧（Theme.category の重複排除・昇順）。
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const th of allThemes) {
      if (th.category) set.add(th.category)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [allThemes])

  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const effectiveCategory =
    (categories.includes(selectedCategory) ? selectedCategory : categories[0]) || ''

  // 選択カテゴリのテーマ（名前昇順）。
  const themesInCategory = useMemo(
    () =>
      allThemes
        .filter(th => th.category === effectiveCategory)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allThemes, effectiveCategory],
  )

  const [selectedThemeId, setSelectedThemeId] = useState<string>('')
  const effectiveThemeId =
    (themesInCategory.some(th => th.id === selectedThemeId)
      ? selectedThemeId
      : themesInCategory[0]?.id) || ''

  // 選択テーマに紐づく銘柄（ticker 重複排除 / has_data 優先 → ticker 昇順）。
  const stocksInTheme = useMemo(() => {
    if (!effectiveThemeId) return [] as { ticker: string; name: string; hasData: boolean }[]
    const byTicker = new Map<string, { ticker: string; name: string; hasData: boolean }>()
    for (const c of (companies ?? []) as Company[]) {
      const ticker = (c.ticker ?? '').trim()
      if (!ticker) continue
      if (!parseThemeIds(c.theme_ids).includes(effectiveThemeId)) continue
      const upper = ticker.toUpperCase()
      if (!byTicker.has(upper)) {
        byTicker.set(upper, { ticker: upper, name: c.name, hasData: hasDataTickers.has(upper) })
      }
    }
    return Array.from(byTicker.values()).sort((a, b) => {
      if (a.hasData !== b.hasData) return a.hasData ? -1 : 1
      return a.ticker.localeCompare(b.ticker)
    })
  }, [companies, effectiveThemeId, hasDataTickers])

  const [selectedTicker, setSelectedTicker] = useState<string>('')
  const effectiveTicker =
    (stocksInTheme.some(s => s.ticker === selectedTicker)
      ? selectedTicker
      : stocksInTheme[0]?.ticker) || ''
  const tickerHasData = !!effectiveTicker && hasDataTickers.has(effectiveTicker)

  const { data: fundamentals, isLoading: isFundLoading } = useQuery({
    queryKey: ['financial-fundamentals', effectiveTicker],
    queryFn: () => fetchFinancialFundamentals(effectiveTicker),
    staleTime: CATEGORY_STALE_TIME,
    enabled: !!effectiveTicker && tickerHasData,
  })

  const selectClass =
    'rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-sky-400 focus:ring-1 focus:ring-sky-400 max-w-[20rem]'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('nav.individualStock')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('fundamentals.section.subtitle')}</p>
      </div>

      {/* === SOT-1395: カテゴリ→テーマ→銘柄カスケード + 財務ファンダメンタルズ時系列 === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('fundamentals.section.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('fundamentals.section.subtitle')}</p>
        </div>
        {isThemesLoading ? (
          <PageLoading />
        ) : categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('fundamentals.noData')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="text-xs text-muted-foreground">{t('fundamentals.categoryLabel')}</span>
                <select
                  value={effectiveCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  className={selectClass}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="text-xs text-muted-foreground">{t('fundamentals.themeLabel')}</span>
                <select
                  value={effectiveThemeId}
                  onChange={e => setSelectedThemeId(e.target.value)}
                  className={selectClass}
                >
                  {themesInCategory.map(th => (
                    <option key={th.id} value={th.id}>
                      {th.name}
                    </option>
                  ))}
                </select>
              </label>
              {stocksInTheme.length > 0 && (
                <label className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <span className="text-xs text-muted-foreground">{t('fundamentals.selectLabel')}</span>
                  <select
                    value={effectiveTicker}
                    onChange={e => setSelectedTicker(e.target.value)}
                    className={selectClass}
                  >
                    {stocksInTheme.map(s => (
                      <option key={s.ticker} value={s.ticker}>
                        {s.ticker}{s.name ? ` — ${s.name}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {stocksInTheme.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('fundamentals.noThemeStock')}</p>
            ) : (
              <>
                <ChartCard
                  title={t('fundamentals.chart.title')}
                  subtitle={(tickerHasData ? fundamentals?.name : undefined) ?? effectiveTicker}
                >
                  {!tickerHasData ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">{t('fundamentals.empty')}</p>
                  ) : isFundLoading ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">{t('fundamentals.loading')}</p>
                  ) : (
                    <FinancialFundamentalsChart data={fundamentals} />
                  )}
                </ChartCard>
                <p className="text-xs text-muted-foreground">{t('fundamentals.note')}</p>
              </>
            )}
          </>
        )}
      </section>
    </div>
  )
}
