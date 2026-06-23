import { useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchDashboard, fetchSignalReport, fetchMonthlyData } from '../api'
import ScoreBadge from '../components/ScoreBadge'
import ChartCard from '../components/charts/ChartCard'
import PaperCountsByYearBar from '../components/charts/PaperCountsByYearBar'
import MonthlyPapersLine from '../components/charts/MonthlyPapersLine'
import PrecursorOverlayLine from '../components/charts/PrecursorOverlayLine'
import PrecursorScoreBreakdown from '../components/charts/PrecursorScoreBreakdown'
import ThemeMomentumScatter, { type ThemeMomentumPoint } from '../components/charts/ThemeMomentumScatter'
import SignalTimeline from '../components/charts/SignalTimeline'
import SurgingKeywordsBar from '../components/charts/SurgingKeywordsBar'
import CompanyScoreBar from '../components/charts/CompanyScoreBar'
import { GRAPH_FROM_YEAR } from './dashboardData'
import { aggregateMonthly, computePrecursorBreakdown, trailingIncreasingMonths } from './precursorScore'
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

  // SOT-1159 (案A): 前兆判定オーバーレイ。選択テーマの月次系列を取得し加点根拠を可視化する。
  const [selectedThemeId, setSelectedThemeId] = useState('')
  const overlayThemeId = selectedThemeId || data?.trending_themes?.[0]?.id || ''
  const { data: overlayMonthly } = useQuery({
    queryKey: ['precursor-monthly', overlayThemeId],
    queryFn: () => fetchMonthlyData(overlayThemeId),
    staleTime: 1000 * 60 * 30,
    retry: 1,
    enabled: !!data && !!overlayThemeId,
  })

  // SOT-1161 (案C): 全テーマ俯瞰のモメンタム散布図。前兆スコア上位N件の月次系列を並列取得して指標化する。
  const scatterThemes = [...(data?.trending_themes ?? [])]
    .sort((a, b) => b.precursor_score - a.precursor_score)
    .slice(0, 12)
  const momentumQueries = useQueries({
    queries: scatterThemes.map(theme => ({
      queryKey: ['momentum-monthly', theme.id],
      queryFn: () => fetchMonthlyData(theme.id),
      staleTime: 1000 * 60 * 30,
      retry: 1,
      enabled: !!data,
    })),
  })
  const momentumLoading = momentumQueries.some(q => q.isLoading)
  const momentumPoints: ThemeMomentumPoint[] = scatterThemes.flatMap((theme, i) => {
    const rows = momentumQueries[i]?.data
    if (!rows) return []
    const series = aggregateMonthly(rows)
    if (series.length === 0) return []
    const breakdown = computePrecursorBreakdown(series)
    return [{
      id: theme.id,
      name: theme.name,
      momPct: breakdown.momPct ?? 0,
      streakMonths: trailingIncreasingMonths(series),
      latestCount: series[series.length - 1]?.count ?? 0,
      score: theme.precursor_score,
    }]
  })

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <span className="h-8 w-8 mb-3 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
      <p className="text-sm">{t('common.loading')}</p>
    </div>
  )
  if (error || !data) return (
    <div className="mx-auto max-w-md text-center py-16">
      <div className="text-3xl mb-2" aria-hidden>⚠️</div>
      <p className="font-semibold text-foreground">{t('common.loadError')}</p>
      <p className="text-sm text-muted-foreground mt-1">{t('common.retryLater')}</p>
    </div>
  )

  // テーマ別の一致度（根拠内訳, /signals-1）。alignment_highlights から theme.id→score。
  const alignmentMap = new Map<string, number>()
  data.alignment_highlights?.high_alignment?.forEach(item => alignmentMap.set(item.theme.id, item.score))
  // 閾値フィルタ後の急増テーマ（/signals-2）。
  const filteredThemes = data.trending_themes.filter(theme => theme.precursor_score >= minScore)

  // SOT-1159 (案A): 選択テーマの前兆スコア加点内訳（フロントで scoring.py を再現）。
  const overlaySeries = aggregateMonthly(overlayMonthly ?? [])
  const overlayBreakdown = computePrecursorBreakdown(overlaySeries)

  return (
    <div className="space-y-8">
      <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('signals.title')}</h1>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-semibold text-foreground">{t('signals.surgingThemes')}</h2>
          {/* 閾値（最小前兆スコア）調整スライダー（SOT-995 /signals-2） */}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
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
            <span className="w-8 text-right font-semibold text-foreground">{minScore}</span>
          </label>
        </div>
        {filteredThemes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('signals.noMatch')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredThemes.map(theme => (
              <div key={theme.id} className="bg-surface rounded-lg shadow p-4 border-l-4 border-blue-500">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-foreground">{theme.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{theme.category}</p>
                  </div>
                  <ScoreBadge score={theme.precursor_score} />
                </div>
                {/* シグナル強度の根拠内訳（/signals-1） */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t('signals.strength')}: {theme.precursor_score.toFixed(0)}</span>
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

      {/* === 前兆判定オーバーレイ（案A, SOT-1159）: 加点根拠を月次折れ線に重ね描き === */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t('signals.precursorOverlay.title')}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{t('signals.precursorOverlay.subtitle')}</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t('signals.precursorOverlay.selectTheme')}
            <select
              value={overlayThemeId}
              onChange={e => setSelectedThemeId(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-sm text-foreground"
            >
              {data.trending_themes.map(theme => (
                <option key={theme.id} value={theme.id}>{theme.name}</option>
              ))}
            </select>
          </label>
        </div>
        <ChartCard
          title={
            overlayBreakdown.total > 0
              ? t('signals.precursorOverlay.formula', {
                  total: overlayBreakdown.total,
                  mom: `+${overlayBreakdown.momPoints}`,
                  streak: `+${overlayBreakdown.streakPoints}`,
                })
              : t('signals.precursorOverlay.noSignal')
          }
          subtitle={t('signals.precursorOverlay.thresholdNote')}
        >
          <PrecursorOverlayLine data={overlayMonthly ?? []} />
        </ChartCard>
        {/* 案B (SOT-1160): 前兆スコアを加点要素（MoM寄与・連続増寄与）に分解した積み上げ内訳 */}
        <ChartCard
          title={t('signals.precursorBreakdown.title')}
          subtitle={t('signals.precursorBreakdown.subtitle')}
        >
          <PrecursorScoreBreakdown
            breakdown={overlayBreakdown}
            alignmentScore={alignmentMap.get(overlayThemeId)}
          />
        </ChartCard>
      </section>

      {/* === モメンタム散布図（案C, SOT-1161）: 全テーマを前兆ゾーンで俯瞰 === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('signals.momentumScatter.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('signals.momentumScatter.subtitle')}</p>
        </div>
        <ChartCard title={t('signals.momentumScatter.title')} subtitle={t('signals.momentumScatter.subtitle')}>
          {momentumLoading && momentumPoints.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
              <span className="h-6 w-6 mb-2 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
              <p>{t('signals.momentumScatter.loading')}</p>
            </div>
          ) : (
            <ThemeMomentumScatter points={momentumPoints} />
          )}
        </ChartCard>
      </section>

      {/* === 前兆→その後タイムライン（案D, SOT-1162）: 選択テーマの発火月＋発火後追従 === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('signals.signalTimeline.title')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('signals.signalTimeline.subtitle')}</p>
        </div>
        <ChartCard title={t('signals.signalTimeline.title')}>
          <SignalTimeline data={overlayMonthly ?? []} />
        </ChartCard>
        <div className="flex flex-col gap-1">
          <Link to="/evaluation" className="text-sm font-medium text-sky-700 hover:underline">
            {t('signals.signalTimeline.evaluationCta')}
          </Link>
          <p className="text-xs text-muted-foreground">{t('signals.signalTimeline.evaluationNote')}</p>
        </div>
      </section>

      {data.alignment_highlights && (data.alignment_highlights.high_alignment?.length > 0 || data.alignment_highlights.paper_only?.length > 0) && (
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3">{t('signals.alignment.title')}</h2>
          <div className="space-y-3">
            {/* High alignment themes */}
            {data.alignment_highlights.high_alignment?.length > 0 && (
              <div>
                <p className="text-xs text-blue-600 font-medium mb-2">{t('signals.alignment.paperPlusExternal')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {data.alignment_highlights.high_alignment.map(item => (
                    <div key={item.theme.id} className="bg-surface rounded-lg shadow p-4 border-l-4 border-blue-500">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-foreground">{item.theme.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{item.theme.category}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="block bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            {t('signals.matchScore')} {item.score.toFixed(0)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
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
                    <div key={item.theme.id} className="bg-surface rounded-lg shadow p-4 border-l-4 border-orange-400">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-foreground">{item.theme.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{item.theme.category}</p>
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
        <h2 className="text-lg font-semibold text-foreground mb-3">{t('signals.surgingKeywords.title')}</h2>
        <div className="bg-surface rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm responsive-table">
            <thead className="bg-surface-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">{t('signals.col.keyword')}</th>
                <th className="px-4 py-2 text-left">{t('signals.col.theme')}</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">{t('signals.col.mom')}</th>
              </tr>
            </thead>
            <tbody>
              {data.top_keywords.map((kw, i) => (
                <tr key={i} className="border-t hover:bg-surface-muted">
                  <td className="px-4 py-2 text-muted-foreground" data-label="#">{i + 1}</td>
                  <td className="px-4 py-2 font-medium" data-label={t('signals.col.keyword')}>{kw.keyword}</td>
                  <td className="px-4 py-2 text-muted-foreground" data-label={t('signals.col.theme')}>{kw.theme_name ?? '-'}</td>
                  <td className="px-4 py-2 text-right text-green-600 font-semibold whitespace-nowrap" data-label={t('signals.col.mom')}>+{kw.mom_change_pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* === 論文・研究トレンド === */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{t('signals.papersTrend.title')}</h2>
        <p className="text-xs text-muted-foreground -mt-2">{t('signals.aggregatedTheme')}: {reportQuery}</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={t('signals.b1')}>
            {(isReportLoading || isReportFetching) && !signalReport ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground">
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

      <p className="text-xs text-muted-foreground border-t pt-4">
        {t('dashboard.disclaimer')}
      </p>
    </div>
  )
}
