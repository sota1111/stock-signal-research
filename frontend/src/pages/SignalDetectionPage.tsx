import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchDashboard, fetchSignalReport, fetchMonthlyData } from '../api'
import ScoreBadge from '../components/ScoreBadge'
import ChartCard from '../components/charts/ChartCard'
import PaperCountsByYearBar from '../components/charts/PaperCountsByYearBar'
import MonthlyPapersLine from '../components/charts/MonthlyPapersLine'
import SurgingKeywordsBar from '../components/charts/SurgingKeywordsBar'
import CompanyScoreBar from '../components/charts/CompanyScoreBar'
import { GRAPH_FROM_YEAR } from './dashboardData'
import { useI18n } from '../i18n/useI18n'

// SOT-945/SOT-987/SOT-1069: keep the paper graph on the same 2009 history floor as DashboardPage.
const PAPER_HISTORY_FROM_YEAR = GRAPH_FROM_YEAR

export default function SignalDetectionPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard })
  // 閾値（最小前兆スコア）の調整UI（SOT-995 /signals-2）。
  const [minScore, setMinScore] = useState(0)

  // 急増テーマTOPを既定queryにシグナルレポートを取得（B系チャート用）
  const reportQuery = data?.trending_themes?.[0]?.name ?? 'AI'
  const { data: signalReport, isLoading: isReportLoading, isFetching: isReportFetching } = useQuery({
    queryKey: ['signal-report', reportQuery, PAPER_HISTORY_FROM_YEAR],
    queryFn: () => fetchSignalReport(reportQuery, PAPER_HISTORY_FROM_YEAR),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })
  const { data: monthly } = useQuery({
    queryKey: ['papers-monthly'],
    queryFn: () => fetchMonthlyData(),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data,
  })

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 text-slate-500">
      <span className="h-8 w-8 mb-3 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
      <p className="text-sm">{t('common.loading')}</p>
    </div>
  )
  if (error || !data) return (
    <div className="mx-auto max-w-md text-center py-16">
      <div className="text-3xl mb-2" aria-hidden>⚠️</div>
      <p className="font-semibold text-slate-700">{t('common.loadError')}</p>
      <p className="text-sm text-slate-400 mt-1">{t('common.retryLater')}</p>
    </div>
  )

  // テーマ別の一致度（根拠内訳, /signals-1）。alignment_highlights から theme.id→score。
  const alignmentMap = new Map<string, number>()
  data.alignment_highlights?.high_alignment?.forEach(item => alignmentMap.set(item.theme.id, item.score))
  // 閾値フィルタ後の急増テーマ（/signals-2）。
  const filteredThemes = data.trending_themes.filter(theme => theme.precursor_score >= minScore)

  return (
    <div className="space-y-8">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{t('signals.title')}</h1>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-gray-700">{t('signals.surgingThemes')}</h2>
          {/* 閾値（最小前兆スコア）調整スライダー（SOT-995 /signals-2） */}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            {t('signals.threshold.label')}
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={e => setMinScore(Number(e.target.value))}
              className="accent-sky-600"
            />
            <span className="w-8 text-right font-semibold text-gray-700">{minScore}</span>
          </label>
        </div>
        {filteredThemes.length === 0 ? (
          <p className="text-sm text-gray-400">{t('signals.noMatch')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredThemes.map(theme => (
              <div key={theme.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-800">{theme.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{theme.category}</p>
                  </div>
                  <ScoreBadge score={theme.precursor_score} />
                </div>
                {/* シグナル強度の根拠内訳（/signals-1） */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-gray-500">{t('signals.strength')}: {theme.precursor_score.toFixed(0)}</span>
                  {alignmentMap.has(theme.id) && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">{t('signals.matchScore')} {alignmentMap.get(theme.id)!.toFixed(0)}</span>
                  )}
                  {theme.is_trending && (
                    <span className="rounded bg-orange-100 px-1.5 py-0.5 text-orange-700">{t('signals.continuingTrend')}</span>
                  )}
                </div>
                {/* テーマ詳細・株価評価へワンクリック（/signals-4） */}
                <div className="mt-3 flex items-center gap-3 text-xs">
                  <Link to={`/themes/${theme.id}`} className="text-blue-600 hover:underline">{t('common.detail')}</Link>
                  <Link to={`/stock?theme=${encodeURIComponent(theme.name)}`} className="text-blue-600 hover:underline">{t('nav.stock')}</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.alignment_highlights && (data.alignment_highlights.high_alignment?.length > 0 || data.alignment_highlights.paper_only?.length > 0) && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">{t('signals.alignment.title')}</h2>
          <div className="space-y-3">
            {/* High alignment themes */}
            {data.alignment_highlights.high_alignment?.length > 0 && (
              <div>
                <p className="text-xs text-blue-600 font-medium mb-2">{t('signals.alignment.paperPlusExternal')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.alignment_highlights.high_alignment.map(item => (
                    <div key={item.theme.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800">{item.theme.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.theme.category}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="block bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            {t('signals.matchScore')} {item.score.toFixed(0)}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {t('signals.confidence')} {item.confidence >= 0.8 ? t('level.high') : item.confidence >= 0.5 ? t('level.medium') : t('level.low')}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-blue-700 mt-2">{t('signals.precursorCandidate')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Paper-only themes */}
            {data.alignment_highlights.paper_only?.length > 0 && (
              <div>
                <p className="text-xs text-orange-600 font-medium mb-2">{t('signals.paperOnly')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.alignment_highlights.paper_only.map(item => (
                    <div key={item.theme.id} className="bg-white rounded-lg shadow p-4 border-l-4 border-orange-400">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-800">{item.theme.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{item.theme.category}</p>
                        </div>
                        <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-bold">
                          {t('signals.precursorScore')} {item.precursor_score.toFixed(0)}
                        </span>
                      </div>
                      <p className="text-xs text-orange-600 mt-2">{t('signals.relatedCandidate')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">{t('signals.surgingKeywords.title')}</h2>
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm responsive-table">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">{t('signals.col.keyword')}</th>
                <th className="px-4 py-2 text-left">{t('signals.col.theme')}</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">{t('signals.col.mom')}</th>
              </tr>
            </thead>
            <tbody>
              {data.top_keywords.map((kw, i) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500" data-label="#">{i + 1}</td>
                  <td className="px-4 py-2 font-medium" data-label={t('signals.col.keyword')}>{kw.keyword}</td>
                  <td className="px-4 py-2 text-gray-600" data-label={t('signals.col.theme')}>{kw.theme_name ?? '-'}</td>
                  <td className="px-4 py-2 text-right text-green-600 font-semibold whitespace-nowrap" data-label={t('signals.col.mom')}>+{kw.mom_change_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === 論文・研究トレンド === */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">{t('signals.papersTrend.title')}</h2>
        <p className="text-xs text-gray-400 -mt-2">{t('signals.aggregatedTheme')}: {reportQuery}</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={t('signals.b1')}>
            {(isReportLoading || isReportFetching) && !signalReport ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-gray-400">
                <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
                <p>{t('chart.papers.loading')}</p>
              </div>
            ) : (
              <PaperCountsByYearBar data={signalReport?.paper_counts_by_year ?? []} />
            )}
          </ChartCard>
          <ChartCard title={t('signals.b2')} subtitle={t('signals.b2.subtitle')}>
            <MonthlyPapersLine data={monthly ?? []} />
          </ChartCard>
          <ChartCard title={t('signals.b3')} subtitle={t('signals.b3.subtitle')}>
            <SurgingKeywordsBar data={signalReport?.surging_keywords ?? []} />
          </ChartCard>
          <ChartCard title={t('signals.b4')}>
            <CompanyScoreBar data={signalReport?.top_companies ?? []} />
          </ChartCard>
        </div>
      </section>

      {/* 精度振り返り（検出後の株価で前兆スコアの精度を確認, SOT-995 /signals-5） */}
      <section>
        <div className="rounded-lg border border-sky-100 bg-sky-50 p-4">
          <h2 className="text-base font-semibold text-sky-900">{t('signals.accuracy.title')}</h2>
          <p className="text-sm text-sky-800 mt-1">{t('signals.accuracy.desc')}</p>
          <Link to="/evaluation" className="mt-2 inline-block text-sm font-medium text-sky-700 hover:underline">
            {t('signals.accuracy.cta')}
          </Link>
        </div>
      </section>

      <p className="text-xs text-gray-400 border-t pt-4">
        {t('dashboard.disclaimer')}
      </p>
    </div>
  )
}
