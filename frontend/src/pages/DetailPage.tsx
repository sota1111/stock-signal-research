import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fetchTheme, fetchPapers, fetchMonthlyData, fetchSupplyChain, fetchThemeExternalInfos, fetchThemeAlignment } from '../api'
import { useI18n } from '../i18n/useI18n'
import { PageLoading, PageError } from '../components/AsyncState'

export default function DetailPage() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: theme, isLoading } = useQuery({ queryKey: ['theme', id], queryFn: () => fetchTheme(id!), enabled: !!id })
  const { data: papers, isLoading: isPapersLoading, isFetching: isPapersFetching } = useQuery({ queryKey: ['papers', id], queryFn: () => fetchPapers(id), enabled: !!id })
  const { data: monthly } = useQuery({ queryKey: ['monthly', id], queryFn: () => fetchMonthlyData(id), enabled: !!id })
  const { data: supplyChain } = useQuery({ queryKey: ['supplyChain'], queryFn: fetchSupplyChain })
  const { data: externalInfos } = useQuery({ queryKey: ['externalInfos', id], queryFn: () => fetchThemeExternalInfos(id!), enabled: !!id })
  const { data: alignment } = useQuery({ queryKey: ['alignment', id], queryFn: () => fetchThemeAlignment(id!), enabled: !!id })

  const relatedSC = supplyChain?.filter(sc => sc.from_theme_id === id || sc.to_theme_id === id) ?? []

  if (isLoading) return <PageLoading />
  if (!theme) return <PageError message={t('detail.notFound')} />

  const scoreColor = theme.precursor_score >= 70 ? 'bg-red-500' : theme.precursor_score >= 50 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/list')} className="text-blue-600 hover:underline text-sm">&larr; {t('detail.back')}</button>
      </div>

      <section className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{theme.name}</h1>
            <p className="text-gray-500 mt-1">{theme.category}</p>
            {theme.description && <p className="text-gray-700 mt-3">{theme.description}</p>}
          </div>
          <div className="text-right space-y-2">
            <span className={`${scoreColor} text-white text-lg px-3 py-1 rounded-full font-bold block`}>
              {theme.precursor_score.toFixed(0)}{t('detail.scoreSuffix')}
            </span>
            {theme.is_trending && <span className="block text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">🔥 {t('signals.continuingTrend')}</span>}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">{t('detail.monthlyPapers')}</h2>
        {monthly && monthly.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year_month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#2563eb" name={t('detail.paperCount')} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm">{t('common.noData')}</p>
        )}
      </section>

      {relatedSC.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">{t('detail.supplyChainRelated')}</h2>
          <div className="space-y-2">
            {relatedSC.map(sc => (
              <div key={sc.id} className="flex items-center gap-3 text-sm">
                <span className="bg-blue-50 text-blue-800 px-2 py-1 rounded">{sc.from_theme_name}</span>
                <span className="text-gray-400">→</span>
                <span className="bg-green-50 text-green-800 px-2 py-1 rounded">{sc.to_theme_name}</span>
                {sc.description && <span className="text-gray-500 text-xs">({sc.description})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {alignment && alignment.evidence_count > 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">{t('detail.alignment.title')}</h2>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <div className={`text-3xl font-bold ${alignment.score >= 60 ? 'text-blue-600' : alignment.score >= 40 ? 'text-yellow-600' : 'text-gray-500'}`}>
                {alignment.score.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">{t('detail.alignment.totalScore')}</div>
            </div>
            <div className="flex gap-4 text-sm flex-wrap">
              <div className="text-center">
                <div className="font-semibold text-gray-700">{alignment.news_score.toFixed(0)}</div>
                <div className="text-xs text-gray-500">{t('detail.alignment.news')}</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-gray-700">{alignment.announcement_score.toFixed(0)}</div>
                <div className="text-xs text-gray-500">{t('detail.alignment.announcement')}</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-gray-700">{alignment.earnings_score.toFixed(0)}</div>
                <div className="text-xs text-gray-500">{t('detail.alignment.earnings')}</div>
              </div>
            </div>
            <div className="text-sm">
              <span className={`px-2 py-1 rounded text-xs font-medium ${alignment.confidence >= 0.8 ? 'bg-green-100 text-green-700' : alignment.confidence >= 0.5 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                {t('signals.confidence')}: {alignment.confidence >= 0.8 ? t('level.high') : alignment.confidence >= 0.5 ? t('level.medium') : t('level.low')} ({t('detail.evidence', { n: alignment.evidence_count })})
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">{t('detail.alignment.disclaimer')}</p>
        </section>
      )}

      {externalInfos && externalInfos.news.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">{t('detail.external.news', { n: externalInfos.news.length })}</h2>
          <div className="space-y-3">
            {externalInfos.news.map(item => (
              <div key={item.id} className="border-b pb-3">
                <p className="font-medium text-sm">
                  {item.url
                    ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{item.title}</a>
                    : item.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{item.published_at} · {item.source_name}</p>
                {item.summary && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.summary}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {externalInfos && externalInfos.announcements.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">{t('detail.external.announcements', { n: externalInfos.announcements.length })}</h2>
          <div className="space-y-3">
            {externalInfos.announcements.map(item => (
              <div key={item.id} className="border-b pb-3">
                <p className="font-medium text-sm">
                  {item.url
                    ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{item.title}</a>
                    : item.title}
                </p>
                <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                  <span>{item.published_at}</span>
                  {item.related_company && <span className="bg-gray-100 px-1 rounded">{item.related_company}</span>}
                  <span>{item.source_name}</span>
                </div>
                {item.summary && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.summary}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {externalInfos && externalInfos.earnings.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">{t('detail.external.earnings', { n: externalInfos.earnings.length })}</h2>
          <div className="space-y-3">
            {externalInfos.earnings.map(item => (
              <div key={item.id} className="border-b pb-3">
                <p className="font-medium text-sm">
                  {item.url
                    ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{item.title}</a>
                    : item.title}
                </p>
                <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                  <span>{item.published_at}</span>
                  {item.related_company && <span className="bg-gray-100 px-1 rounded">{item.related_company}</span>}
                  <span>{item.source_name}</span>
                </div>
                {item.summary && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.summary}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">{t('detail.relatedPapers', { n: papers?.length ?? 0 })}</h2>
        {papers && papers.length > 0 ? (
          <div className="space-y-3">
            {papers.map(p => (
              <div key={p.id} className="border-b pb-3">
                <p className="font-medium text-sm">
                  {p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{p.title}</a> : p.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{p.published_at} · {p.source}</p>
                {p.abstract && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{p.abstract}</p>}
              </div>
            ))}
          </div>
        ) : (isPapersLoading || isPapersFetching) && !papers ? (
          <p className="text-gray-400 text-sm">{t('common.loading')}</p>
        ) : (
          <p className="text-gray-400 text-sm">{t('detail.noRelatedPapers')}</p>
        )}
      </section>
    </div>
  )
}
