import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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
  const { data: supplyChain } = useQuery({ queryKey: ['supplyChain'], queryFn: () => fetchSupplyChain() })
  const { data: externalInfos } = useQuery({ queryKey: ['externalInfos', id], queryFn: () => fetchThemeExternalInfos(id!), enabled: !!id })
  const { data: alignment } = useQuery({ queryKey: ['alignment', id], queryFn: () => fetchThemeAlignment(id!), enabled: !!id })

  const relatedSC = supplyChain?.filter(sc => sc.from_theme_id === id || sc.to_theme_id === id) ?? []

  // 情報構造のタブ化（SOT-995 /themes-2）。
  const [detailTab, setDetailTab] = useState<'overview' | 'papers' | 'external' | 'related'>('overview')

  if (isLoading) return <PageLoading />
  if (!theme) return <PageError message={t('detail.notFound')} />

  const scoreColor = theme.precursor_score >= 70 ? 'bg-red-500' : theme.precursor_score >= 50 ? 'bg-yellow-500' : 'bg-green-500'

  // 隣接/関連テーマ（SOT-995 /themes-4）。サプライチェーンの相手側テーマを抽出。
  const relatedThemes = relatedSC
    .map(sc => (sc.from_theme_id === id
      ? { id: sc.to_theme_id, name: sc.to_theme_name }
      : { id: sc.from_theme_id, name: sc.from_theme_name }))
    .filter((th, i, arr) => th.id && th.id !== id && arr.findIndex(x => x.id === th.id) === i)

  const externalCount = externalInfos
    ? externalInfos.news.length + externalInfos.announcements.length + externalInfos.earnings.length + (externalInfos.filings?.length ?? 0)
    : 0

  const detailTabs: { id: typeof detailTab; label: string }[] = [
    { id: 'overview', label: t('detail.tab.overview') },
    { id: 'papers', label: t('detail.tab.papers') },
    { id: 'external', label: t('detail.tab.external') },
    { id: 'related', label: t('detail.tab.related') },
  ]

  return (
    <div className="space-y-8">
      {/* パンくず: ダッシュボード / テーマ一覧 / 現在のテーマ（SOT-1020 / 提案6） */}
      <nav aria-label="breadcrumb" className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
        <Link to="/" className="text-blue-600 hover:underline">{t('nav.dashboard')}</Link>
        <span aria-hidden className="text-gray-300">/</span>
        <Link to="/list" className="text-blue-600 hover:underline">{t('nav.themes')}</Link>
        <span aria-hidden className="text-gray-300">/</span>
        <span className="text-gray-700 font-medium truncate max-w-[16rem]">{theme.name}</span>
      </nav>
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
            <div>
              <span className={`${scoreColor} text-white text-lg px-3 py-1 rounded-full font-bold block`}>
                {theme.precursor_score.toFixed(0)}{t('detail.scoreSuffix')}
              </span>
              <span className="block text-xs text-gray-400 mt-0.5">{t('detail.summary.precursor')}</span>
            </div>
            {/* アラインメントスコア＋兆候サマリを冒頭に（SOT-995 /themes-1） */}
            {alignment && alignment.evidence_count > 0 && (
              <div>
                <span className="bg-blue-600 text-white text-lg px-3 py-1 rounded-full font-bold block">
                  {alignment.score.toFixed(0)}
                </span>
                <span className="block text-xs text-gray-400 mt-0.5">{t('detail.summary.alignment')}</span>
              </div>
            )}
            {theme.is_trending && <span className="block text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">🔥 {t('signals.continuingTrend')}</span>}
          </div>
        </div>
      </section>

      {/* セクションタブ（SOT-995 /themes-2） */}
      <div className="flex flex-wrap gap-2 border-b">
        {detailTabs.map(tb => (
          <button
            key={tb.id}
            onClick={() => setDetailTab(tb.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${detailTab === tb.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {tb.id === 'external' ? `${tb.label} (${externalCount})` : tb.id === 'papers' ? `${tb.label} (${papers?.length ?? 0})` : tb.label}
          </button>
        ))}
      </div>

      {/* 兆候→検証→投資判断の一貫導線（SOT-999 / 提案A-2）。
          テーマ名/IDを query で引き継ぎ、遷移先のグローバルフィルタで選択済みにする。 */}
      <section className="bg-white rounded-lg shadow p-4">
        <p className="text-sm font-semibold text-gray-600 mb-3">{t('detail.flow.title')}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link to={`/papers?theme=${encodeURIComponent(theme.name)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50">{t('nav.papers')}</Link>
          <span className="text-gray-300" aria-hidden>→</span>
          <Link to={`/patents?theme_id=${encodeURIComponent(theme.id)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50">{t('nav.patents')}</Link>
          <span className="text-gray-300" aria-hidden>→</span>
          <Link to={`/investors?theme=${encodeURIComponent(theme.name)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50">{t('nav.investors')}</Link>
          <span className="text-gray-300" aria-hidden>→</span>
          <Link to={`/stock?theme=${encodeURIComponent(theme.name)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50">{t('nav.stock')}</Link>
          <span className="text-gray-300" aria-hidden>→</span>
          <Link to={`/evaluation?theme=${encodeURIComponent(theme.name)}`} className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-gray-700 hover:bg-gray-50">{t('nav.evaluation')}</Link>
        </div>
      </section>

      {detailTab === 'overview' && (
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
      )}

      {detailTab === 'related' && (
        <section className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* 関連テーマ間ナビ（SOT-995 /themes-4） */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">{t('detail.relatedThemes')}</h2>
            {relatedThemes.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {relatedThemes.map(rt => (
                  <Link
                    key={rt.id}
                    to={`/themes/${rt.id}`}
                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-700 hover:bg-sky-100"
                  >
                    {rt.name || rt.id}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">{t('common.noData')}</p>
            )}
          </div>
          {/* サプライチェーン関連 */}
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">{t('detail.supplyChainRelated')}</h2>
            {relatedSC.length > 0 ? (
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
            ) : (
              <p className="text-gray-400 text-sm">{t('common.noData')}</p>
            )}
          </div>
        </section>
      )}

      {detailTab === 'overview' && alignment && alignment.evidence_count > 0 && (
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

      {detailTab === 'external' && externalInfos && ([
        { key: 'news', items: externalInfos.news, label: 'detail.external.news', badge: 'bg-blue-100 text-blue-700' },
        { key: 'announcements', items: externalInfos.announcements, label: 'detail.external.announcements', badge: 'bg-purple-100 text-purple-700' },
        { key: 'earnings', items: externalInfos.earnings, label: 'detail.external.earnings', badge: 'bg-emerald-100 text-emerald-700' },
        { key: 'filings', items: externalInfos.filings ?? [], label: 'detail.external.filings', badge: 'bg-amber-100 text-amber-700' },
      ] as const).filter(group => group.items.length > 0).map(group => (
        <section key={group.key} className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">{t(group.label, { n: group.items.length })}</h2>
          <div className="space-y-3">
            {group.items.map(item => (
              <div key={item.id} className="border-b pb-3">
                <p className="font-medium text-sm">
                  {item.url
                    ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{item.title}</a>
                    : item.title}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-1">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${group.badge}`}>{t(`detail.external.type.${group.key}`)}</span>
                  {item.published_at && <span>{item.published_at}</span>}
                  {item.related_company && <span className="bg-gray-100 px-1 rounded">{item.related_company}</span>}
                  {item.source_name && <span>{item.source_name}</span>}
                  {item.relevance_score > 0 && (
                    <span className="text-gray-400">{t('detail.external.relevance', { n: Math.round(item.relevance_score) })}</span>
                  )}
                </div>
                {item.summary && <p className="text-xs text-gray-600 mt-1 line-clamp-2">{item.summary}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}

      {detailTab === 'papers' && (
      <section className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-gray-700">{t('detail.relatedPapers', { n: papers?.length ?? 0 })}</h2>
          {/* 論文一覧への相互リンク（SOT-995 /themes-3） */}
          <Link to={`/papers?theme=${encodeURIComponent(theme.name)}`} className="text-sm text-blue-600 hover:underline">{t('detail.viewInPapers')}</Link>
        </div>
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
      )}
    </div>
  )
}
