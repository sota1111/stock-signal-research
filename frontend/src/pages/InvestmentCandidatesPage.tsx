import React, { useMemo, useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import {
  fetchThemes,
  fetchPatentYearly,
  fetchInvestors,
  fetchMonthlyData,
  fetchSignalAlignment,
} from '../api'
import ChartCard from '../components/charts/ChartCard'
import LeadLagCorrelationBar from '../components/charts/LeadLagCorrelationBar'
import LeadLagSeriesChart from '../components/charts/LeadLagSeriesChart'
import { useDashboardQuery, useTickerStocks } from './dashboardData'
import { DashboardLoading, DashboardError } from './dashboardShared'
import {
  aggregatePaperMonthly,
  buildMarketMonthlyIndex,
  buildLeadLagSeries,
  computeLeadLag,
  type GrowthMode,
} from './leadLagData'
import { buildCompositeRanking, COMPOSITE_WEIGHTS } from './compositeScore'
import { useI18n } from '../i18n/useI18n'
import type { PaperMonthlyCount } from '../types'

const STALE = 1000 * 60 * 30
// リードラグの対象テーマは前兆スコア上位のトレンドテーマに限定する（月次系列をまとめて取得して
// 「データがあるテーマ」へ自動フォールバックするため、件数を抑える）。
const LEADLAG_THEME_LIMIT = 10

export default function InvestmentCandidatesPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useDashboardQuery()
  const companies = useMemo(() => data?.notable_companies ?? [], [data])

  const [themeId, setThemeId] = useState('')
  const [growthMode, setGrowthMode] = useState<GrowthMode>('mom')

  const { data: themes } = useQuery({ queryKey: ['themes'], queryFn: fetchThemes, staleTime: STALE })
  const { data: patentYearly } = useQuery({ queryKey: ['patent-yearly-all'], queryFn: () => fetchPatentYearly(), staleTime: STALE })
  const { data: investors } = useQuery({ queryKey: ['investors'], queryFn: fetchInvestors, staleTime: STALE })

  // リードラグ: 注目企業の株価から合成マーケット指数を組み立てる。
  const { stockItems, stockQueries } = useTickerStocks(companies)
  const stockMonthly = useMemo(() => buildMarketMonthlyIndex(stockItems), [stockItems])

  // 対象テーマ候補（前兆トレンド上位）。各テーマの月次系列をまとめて取得し、データがあるテーマへ
  // 自動フォールバックする（既定テーマに月次データが無くてもグラフを描けるようにする）。
  const leadLagThemes = useMemo(() => (data?.trending_themes ?? []).slice(0, LEADLAG_THEME_LIMIT), [data])
  const monthlyQueries = useQueries({
    queries: leadLagThemes.map(th => ({
      queryKey: ['papers-monthly', th.id],
      queryFn: () => fetchMonthlyData(th.id),
      staleTime: STALE,
      enabled: !!data,
    })),
  })

  // テーマID → 非空の月次系列。
  const monthlySignature = monthlyQueries.map(q => q.dataUpdatedAt).join(',')
  const monthlyByTheme = useMemo(() => {
    const m = new Map<string, PaperMonthlyCount[]>()
    leadLagThemes.forEach((th, i) => {
      const d = monthlyQueries[i]?.data
      if (d && d.length > 0) m.set(th.id, d)
    })
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadLagThemes, monthlySignature])

  // 既定テーマはデータがある最初のテーマ（ユーザー選択があればそれを優先）。
  const firstThemeWithData = leadLagThemes.find(th => monthlyByTheme.has(th.id))?.id ?? ''
  const effThemeId = themeId || firstThemeWithData || leadLagThemes[0]?.id || ''
  const sourceMonthly = useMemo(() => monthlyByTheme.get(effThemeId) ?? [], [monthlyByTheme, effThemeId])
  const paperMonthly = useMemo(() => aggregatePaperMonthly(sourceMonthly), [sourceMonthly])

  const { results, bestLag } = useMemo(
    () => computeLeadLag(paperMonthly, stockMonthly, undefined, growthMode),
    [paperMonthly, stockMonthly, growthMode],
  )
  const series = useMemo(
    () => buildLeadLagSeries(paperMonthly, stockMonthly),
    [paperMonthly, stockMonthly],
  )

  const ranking = useMemo(
    () => buildCompositeRanking(companies, themes ?? [], patentYearly ?? [], investors ?? []),
    [companies, themes, patentYearly, investors],
  )

  // 読み込み中（株価・月次のいずれかが取得中）か、データはあるが重なりが無いかを区別する。
  const leadLagLoading = stockQueries.some(q => q.isLoading) || monthlyQueries.some(q => q.isLoading)

  if (isLoading) return <DashboardLoading />
  if (error || !data) return <DashboardError />

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">{t('candidates.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('candidates.subtitle')}</p>
      </div>

      {/* 提案3: リードラグ分析 */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{t('candidates.leadlag.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('candidates.leadlag.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* 論文増加率: 前月比 / 前年比 の切替 */}
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-sm">
              {(['mom', 'yoy'] as GrowthMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setGrowthMode(mode)}
                  className={
                    growthMode === mode
                      ? 'bg-sky-600 text-white px-3 py-1'
                      : 'bg-surface text-foreground px-3 py-1 hover:bg-surface-muted'
                  }
                >
                  {mode === 'mom' ? t('candidates.leadlag.mom') : t('candidates.leadlag.yoy')}
                </button>
              ))}
            </div>
            {leadLagThemes.length > 0 && (
              <div className="flex items-center gap-2">
                <label htmlFor="leadlag-theme" className="shrink-0 text-sm text-muted-foreground">{t('candidates.leadlag.selectTheme')}</label>
                <select
                  id="leadlag-theme"
                  value={effThemeId}
                  onChange={e => setThemeId(e.target.value)}
                  className="rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
                >
                  {leadLagThemes.map(th => <option key={th.id} value={th.id}>{th.name}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md bg-sky-50 border border-sky-100 px-4 py-3 text-sm text-sky-800">
          {leadLagLoading
            ? t('candidates.leadlag.loading')
            : bestLag != null
              ? t('candidates.leadlag.best', { n: bestLag })
              : t('candidates.leadlag.noData')}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title={t('candidates.leadlag.corrTitle')} subtitle={t('candidates.leadlag.corrSubtitle')}>
            {leadLagLoading
              ? <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">{t('candidates.leadlag.loading')}</div>
              : <LeadLagCorrelationBar results={results} />}
          </ChartCard>
          <ChartCard title={t('candidates.leadlag.seriesTitle')} subtitle={t('candidates.leadlag.seriesSubtitle')}>
            {leadLagLoading
              ? <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">{t('candidates.leadlag.loading')}</div>
              : <LeadLagSeriesChart data={series} />}
          </ChartCard>
        </div>
      </section>

      {/* 提案4: 複合スコア投資候補ランキング */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{t('candidates.ranking.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('candidates.ranking.subtitle', {
              paper: Math.round(COMPOSITE_WEIGHTS.paper * 100),
              patent: Math.round(COMPOSITE_WEIGHTS.patent * 100),
              investor: Math.round(COMPOSITE_WEIGHTS.investor * 100),
            })}
          </p>
        </div>
        {ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('candidates.ranking.empty')}</p>
        ) : (
          <div className="bg-surface rounded-lg shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-muted text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-right">#</th>
                  <th className="px-4 py-2 text-left">{t('candidates.ranking.col.company')}</th>
                  <th className="px-4 py-2 text-right">{t('candidates.ranking.col.composite')}</th>
                  <th className="px-4 py-2 text-right">{t('candidates.ranking.col.paper')}</th>
                  <th className="px-4 py-2 text-right">{t('candidates.ranking.col.patent')}</th>
                  <th className="px-4 py-2 text-right">{t('candidates.ranking.col.investor')}</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(row => (
                  <tr key={row.company.id} className="border-t hover:bg-surface-muted">
                    <td className="px-4 py-2 text-right text-muted-foreground" data-label="#">{row.rank}</td>
                    <td className="px-4 py-2" data-label={t('candidates.ranking.col.company')}>
                      <span className="font-medium text-foreground">{row.company.name}</span>
                      {row.company.ticker && <span className="ml-2 text-xs text-muted-foreground">{row.company.ticker}</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-foreground" data-label={t('candidates.ranking.col.composite')}>
                      {row.composite.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right text-muted-foreground" data-label={t('candidates.ranking.col.paper')}>{row.paper.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground" data-label={t('candidates.ranking.col.patent')}>{row.patent.toFixed(0)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground" data-label={t('candidates.ranking.col.investor')}>{row.investor.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 一致度評価（SOT-1147: 旧 /evaluation ページを統合） */}
      <AlignmentSection />
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────────────
// 一致度評価セクション（旧 EvaluationPage を投資候補ページへ統合, SOT-1147）。
// 独自に signal-alignment を取得し、読み込み/エラーはこのセクション内で完結させる
// （ダッシュボードのクエリとは独立。エラーでページ全体を空にしない）。
// ───────────────────────────────────────────────────────────────────────────

function HitBadge({ hit }: { hit: boolean }) {
  const { t } = useI18n()
  return (
    <span className={`${hit ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-foreground'} text-xs px-2 py-0.5 rounded font-medium`}>
      {hit ? t('eval.hit') : t('eval.miss')}
    </span>
  )
}

function FormatPercent({ value, showPlus = false }: { value: number; showPlus?: boolean }) {
  const formatted = (value * 100).toFixed(1)
  const prefix = showPlus && value > 0 ? '+' : ''
  const color = value > 0 ? 'text-red-600' : value < 0 ? 'text-blue-600' : 'text-muted-foreground'
  return <span className={`font-semibold ${color}`}>{prefix}{formatted}%</span>
}

function AlignmentSection() {
  const { t } = useI18n()
  // 評価窓(期間)を可変化: baseline を変更して再評価する（SOT-995 /evaluation-1）。
  const [baseline, setBaseline] = useState('')
  // 低スコア要因ドリルダウン用の展開行（SOT-995 /evaluation-4）。
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['signal-alignment', baseline],
    queryFn: () => fetchSignalAlignment(baseline || undefined),
  })

  // 最も相関が高い窓（リードラグの目安, /evaluation-2）。
  const bestWindow = data
    ? data.summary.windows.reduce<typeof data.summary.windows[number] | null>(
        (best, w) => (best == null || Math.abs(w.correlation) > Math.abs(best.correlation) ? w : best),
        null,
      )
    : null

  // CSV エクスポート（/evaluation-4）。
  const exportCsv = () => {
    if (!data) return
    const windows = data.summary.windows
    const header = ['ticker', 'name', 'signal_score', ...windows.flatMap(w => [`return_${w.window_days}d`, `hit_${w.window_days}d`])]
    const rows = data.companies.map(c => [
      c.ticker,
      c.name,
      c.signal_score.toFixed(2),
      ...windows.flatMap(w => {
        const r = c.results.find(x => x.window_days === w.window_days)
        return [r ? (r.forward_return_pct * 100).toFixed(2) : '', r ? (r.hit ? '1' : '0') : '']
      }),
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([`${String.fromCharCode(0xfeff)}${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evaluation_${data.baseline}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // リターン ヒートマップ用の色（/evaluation-3）。
  const returnColor = (pct: number) => {
    const clamped = Math.max(-0.2, Math.min(0.2, pct))
    if (clamped >= 0) return `rgba(239, 68, 68, ${0.15 + (clamped / 0.2) * 0.55})`
    return `rgba(59, 130, 246, ${0.15 + (Math.abs(clamped) / 0.2) * 0.55})`
  }

  return (
    <section className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">{t('eval.title')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t('eval.baseline')}
            <input
              type="date"
              value={baseline || data?.baseline || ''}
              onChange={e => setBaseline(e.target.value)}
              className="rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
            />
          </label>
          {bestWindow && (
            <span className="text-xs rounded bg-blue-50 px-2 py-1 text-blue-700">
              {t('eval.bestWindow')}: {t('eval.windowLabel', { n: bestWindow.window_days })}（{t('eval.correlation')} {bestWindow.correlation.toFixed(2)}）
            </span>
          )}
          <button
            onClick={exportCsv}
            disabled={!data}
            className="ml-auto rounded-md border border-gray-300 bg-surface px-3 py-1 text-sm text-foreground hover:bg-surface-muted disabled:opacity-50"
          >
            {t('eval.export')}
          </button>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-md text-sm">
        <p className="font-semibold mb-1">{t('eval.disclaimerTitle')}</p>
        <p>{t('eval.disclaimerBody')}</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('common.loading')}</div>
      ) : error || !data ? (
        <div className="text-center py-12 text-red-500">{t('common.loadError')}</div>
      ) : (
        <>
          <div>
            <h3 className="text-base font-semibold text-foreground mb-3">{t('eval.summary.title')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.summary.windows.map(window => (
                <div key={window.window_days} className="bg-surface rounded-lg shadow p-6 border-t-4 border-blue-600">
                  <h4 className="text-xl font-bold text-foreground mb-4">{t('eval.windowLabel', { n: window.window_days })}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-surface-muted p-3 rounded">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('eval.directionHitRate')}</p>
                      <p className="text-2xl font-bold text-foreground">{(window.direction_hit_rate * 100).toFixed(0)}%</p>
                    </div>
                    <div className="bg-surface-muted p-3 rounded">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('eval.correlation')}</p>
                      <p className="text-2xl font-bold text-foreground">{window.correlation.toFixed(2)}</p>
                    </div>
                    <div className="bg-surface-muted p-3 rounded">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('eval.avgReturnHigh')}</p>
                      <p className="text-lg font-bold">
                        <FormatPercent value={window.avg_return_high_signal} showPlus />
                      </p>
                    </div>
                    <div className="bg-surface-muted p-3 rounded">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">{t('eval.avgReturnLow')}</p>
                      <p className="text-lg font-bold">
                        <FormatPercent value={window.avg_return_low_signal} showPlus />
                      </p>
                    </div>
                  </div>
                  {/* シグナル有効性（高シグナル−低シグナルのリターン差, /evaluation-5） */}
                  <div className="mt-3 flex items-center justify-between bg-blue-50 rounded px-3 py-2">
                    <span className="text-xs text-blue-700">{t('eval.effectiveness')}</span>
                    <FormatPercent value={window.avg_return_high_signal - window.avg_return_low_signal} showPlus />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 text-right">{t('eval.evaluatedCount')}: {window.evaluated_count}</p>
                </div>
              ))}
            </div>
          </div>

          {/* リターン ヒートマップ（銘柄 × 窓, /evaluation-3） */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">{t('eval.heatmap.title')}</h3>
            <p className="text-sm text-muted-foreground mb-3">{t('eval.heatmap.subtitle')}</p>
            <div className="bg-surface rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Ticker</th>
                    {data.summary.windows.map(w => (
                      <th key={w.window_days} className="px-4 py-2 text-center">{t('eval.windowLabel', { n: w.window_days })}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.companies.map(company => (
                    <tr key={company.company_id} className="border-t">
                      <td className="px-4 py-2 font-mono text-muted-foreground">{company.ticker}</td>
                      {data.summary.windows.map(w => {
                        const r = company.results.find(x => x.window_days === w.window_days)
                        return (
                          <td
                            key={w.window_days}
                            className="px-4 py-2 text-center"
                            style={{ backgroundColor: r ? returnColor(r.forward_return_pct) : undefined }}
                          >
                            {r ? `${(r.forward_return_pct * 100).toFixed(1)}%` : '-'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-foreground mb-3">{t('eval.detail.title')}</h3>
            <div className="bg-surface rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm responsive-table">
                <thead className="bg-surface-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Ticker</th>
                    <th className="px-4 py-3 text-left">{t('eval.col.name')}</th>
                    <th className="px-4 py-3 text-right">{t('eval.col.signalScore')}</th>
                    {data.summary.windows.map(w => (
                      <th key={w.window_days} colSpan={2} className="px-4 py-3 text-center border-l">
                        {t('eval.col.returnVerdict', { n: w.window_days })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {data.companies.map(company => (
                    <React.Fragment key={company.company_id}>
                      <tr
                        className="hover:bg-surface-muted cursor-pointer"
                        onClick={() => setExpanded(e => (e === company.company_id ? null : company.company_id))}
                      >
                        <td className="px-4 py-3 font-mono text-muted-foreground" data-label="Ticker">
                          <span className="mr-1 text-muted-foreground">{expanded === company.company_id ? '▾' : '▸'}</span>{company.ticker}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground" data-label={t('eval.col.name')}>{company.name}</td>
                        <td className="px-4 py-3 text-right" data-label={t('eval.col.signalScore')}>
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-bold">
                            {company.signal_score.toFixed(1)}
                          </span>
                        </td>
                        {data.summary.windows.map(w => {
                          const result = company.results.find(r => r.window_days === w.window_days)
                          return (
                            <React.Fragment key={w.window_days}>
                              <td className="px-4 py-3 text-right border-l" data-label={t('eval.col.return', { n: w.window_days })}>
                                {result ? <FormatPercent value={result.forward_return_pct} showPlus /> : '-'}
                              </td>
                              <td className="px-4 py-3 text-center" data-label={t('eval.col.verdict', { n: w.window_days })}>
                                {result ? <HitBadge hit={result.hit} /> : '-'}
                              </td>
                            </React.Fragment>
                          )
                        })}
                      </tr>
                      {/* 低スコア要因ドリルダウン（予測方向 vs 実際, /evaluation-4） */}
                      {expanded === company.company_id && (
                        <tr className="bg-surface-muted">
                          <td colSpan={3 + data.summary.windows.length * 2} className="px-4 py-3">
                            <div className="flex flex-wrap gap-4">
                              {company.results.map(r => (
                                <div key={r.window_days} className="rounded border border-border bg-surface px-3 py-2 text-xs">
                                  <p className="font-semibold text-foreground mb-1">{t('eval.windowLabel', { n: r.window_days })}</p>
                                  <p className="text-muted-foreground">{t('eval.col.predicted')}: {r.predicted_direction === 'up' ? t('eval.dir.up') : t('eval.dir.down')}</p>
                                  <p className="text-muted-foreground">{t('eval.col.actual')}: {r.actual_direction === 'up' ? t('eval.dir.up') : t('eval.dir.down')}</p>
                                  <p className="mt-1"><FormatPercent value={r.forward_return_pct} showPlus /> <HitBadge hit={r.hit} /></p>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
