import ScoreBadge from '../components/ScoreBadge'
import ChartCard from '../components/charts/ChartCard'
import { useDashboardQuery } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import { useI18n } from '../i18n/useI18n'

const J_PLATPAT_URL = 'https://www.j-platpat.inpit.go.jp/'

function googlePatentsUrl(query: string) {
  return `https://patents.google.com/?q=${encodeURIComponent(query)}`
}

export default function PatentsPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useDashboardQuery()

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('patents.title')}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {t('patents.subtitle')}
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-700">{t('patents.themeSearch.title')}</h2>
          <p className="text-sm text-gray-500">
            {t('patents.themeSearch.subtitle')}
          </p>
        </div>
        {data.trending_themes.length === 0 ? (
          <p className="text-sm text-gray-400">{t('patents.noThemes')}</p>
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
          title={t('patents.keywordSearch.title')}
          subtitle={t('patents.keywordSearch.subtitle')}
        >
          {data.top_keywords.length === 0 ? (
            <p className="text-sm text-gray-400">{t('patents.noKeywords')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {data.top_keywords.map(k => (
                <a
                  key={k.keyword}
                  href={googlePatentsUrl(k.keyword)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 hover:text-sky-600"
                  title={k.theme_name ? t('patents.themeTooltip', { name: k.theme_name }) : undefined}
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
