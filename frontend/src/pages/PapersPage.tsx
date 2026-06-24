import { useFilters } from '../contexts/useFilters'
import { useDashboardQuery } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

export default function PapersPage() {
  const { t } = useI18n()
  // テーマ選択はグローバルフィルタ(URL永続化)を参照する（SOT-997）。
  const { theme: selectedTheme, setTheme } = useFilters()
  const { data, isLoading, error } = useDashboardQuery()

  // 急増テーマのハイライト判定に使う現在のテーマ。
  const reportQuery = selectedTheme || data?.trending_themes?.[0]?.name || 'AI'

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  // 急増テーマ（SOT-995 /papers-4）: 急増キーワードをテーマ別に集約し、伸び率の大きい順に上位表示する。
  const surgingByTheme = new Map<string, number>()
  for (const kw of data.top_keywords) {
    if (!kw.theme_name) continue
    surgingByTheme.set(kw.theme_name, Math.max(surgingByTheme.get(kw.theme_name) ?? -Infinity, kw.mom_change_pct))
  }
  const surgingThemes = [...surgingByTheme.entries()]
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('nav.papers')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('papers.subtitle')}</p>
      </div>

      {/* 急増テーマ ハイライト（SOT-995 /papers-4） */}
      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('papers.surging.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('papers.surging.subtitle')}</p>
        </div>
        {surgingThemes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('papers.surging.empty')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {surgingThemes.map(([name, pct]) => (
              <button
                key={name}
                type="button"
                onClick={() => setTheme(name)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                  name === reportQuery
                    ? 'border-amber-400 bg-amber-100 text-amber-800'
                    : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
              >
                <span className="truncate max-w-[12rem]">{name}</span>
                <span className="font-semibold">+{pct.toFixed(0)}%</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
