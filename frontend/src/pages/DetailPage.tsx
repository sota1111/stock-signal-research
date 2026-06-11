import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fetchTheme, fetchPapers, fetchMonthlyData, fetchSupplyChain, fetchThemeExternalInfos, fetchThemeAlignment } from '../api'

export default function DetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: theme, isLoading } = useQuery({ queryKey: ['theme', id], queryFn: () => fetchTheme(id!), enabled: !!id })
  const { data: papers } = useQuery({ queryKey: ['papers', id], queryFn: () => fetchPapers(id), enabled: !!id })
  const { data: monthly } = useQuery({ queryKey: ['monthly', id], queryFn: () => fetchMonthlyData(id), enabled: !!id })
  const { data: supplyChain } = useQuery({ queryKey: ['supplyChain'], queryFn: fetchSupplyChain })
  const { data: externalInfos } = useQuery({ queryKey: ['externalInfos', id], queryFn: () => fetchThemeExternalInfos(id!), enabled: !!id })
  const { data: alignment } = useQuery({ queryKey: ['alignment', id], queryFn: () => fetchThemeAlignment(id!), enabled: !!id })

  const relatedSC = supplyChain?.filter(sc => sc.from_theme_id === id || sc.to_theme_id === id) ?? []

  if (isLoading) return <div className="text-center py-12 text-gray-500">読み込み中...</div>
  if (!theme) return <div className="text-center py-12 text-red-500">テーマが見つかりません</div>

  const scoreColor = theme.precursor_score >= 70 ? 'bg-red-500' : theme.precursor_score >= 50 ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/list')} className="text-blue-600 hover:underline text-sm">&larr; 一覧に戻る</button>
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
              {theme.precursor_score.toFixed(0)}点
            </span>
            {theme.is_trending && <span className="block text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">🔥 継続トレンド</span>}
          </div>
        </div>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">月次論文数推移</h2>
        {monthly && monthly.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year_month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#2563eb" name="論文数" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm">データなし</p>
        )}
      </section>

      {relatedSC.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">サプライチェーン関連</h2>
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
          <h2 className="text-lg font-semibold text-gray-700 mb-4">論文トレンドとの一致度</h2>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="text-center">
              <div className={`text-3xl font-bold ${alignment.score >= 60 ? 'text-blue-600' : alignment.score >= 40 ? 'text-yellow-600' : 'text-gray-500'}`}>
                {alignment.score.toFixed(0)}
              </div>
              <div className="text-xs text-gray-500 mt-1">総合一致度スコア</div>
            </div>
            <div className="flex gap-4 text-sm flex-wrap">
              <div className="text-center">
                <div className="font-semibold text-gray-700">{alignment.news_score.toFixed(0)}</div>
                <div className="text-xs text-gray-500">ニュース</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-gray-700">{alignment.announcement_score.toFixed(0)}</div>
                <div className="text-xs text-gray-500">企業発表</div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-gray-700">{alignment.earnings_score.toFixed(0)}</div>
                <div className="text-xs text-gray-500">決算説明</div>
              </div>
            </div>
            <div className="text-sm">
              <span className={`px-2 py-1 rounded text-xs font-medium ${alignment.confidence >= 0.8 ? 'bg-green-100 text-green-700' : alignment.confidence >= 0.5 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>
                信頼度: {alignment.confidence >= 0.8 ? '高' : alignment.confidence >= 0.5 ? '中' : '低'} (根拠 {alignment.evidence_count}件)
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">※ このスコアは情報収集・分析支援を目的としています。投資推奨ではありません。</p>
        </section>
      )}

      {externalInfos && externalInfos.news.length > 0 && (
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">確認すべき外部情報 — ニュース ({externalInfos.news.length}件)</h2>
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
          <h2 className="text-lg font-semibold text-gray-700 mb-4">確認すべき外部情報 — 企業発表 ({externalInfos.announcements.length}件)</h2>
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
          <h2 className="text-lg font-semibold text-gray-700 mb-4">確認すべき外部情報 — 決算説明 ({externalInfos.earnings.length}件)</h2>
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
        <h2 className="text-lg font-semibold text-gray-700 mb-4">関連論文 ({papers?.length ?? 0}件)</h2>
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
        ) : (
          <p className="text-gray-400 text-sm">関連論文なし</p>
        )}
      </section>
    </div>
  )
}
