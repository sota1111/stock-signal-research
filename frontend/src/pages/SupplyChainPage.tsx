import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchSupplyChain, fetchCompanies } from '../api'
import type { SupplyChainItem, SupplyChainGraphNode, SupplyChainGraphEdge } from '../types'
import ChartCard from '../components/charts/ChartCard'
import SupplyChainGraphView from '../components/charts/SupplyChainGraphView'
import { PageLoading, PageError, PageEmpty } from '../components/AsyncState'
import { useI18n } from '../i18n/useI18n'

// relation_type の表示ラベル（messages の MessageKey は固定 union のため動的キーを避け、ここで局所定義）
const REL_LABELS: Record<'ja' | 'en', Record<string, string>> = {
  ja: { supplies: '供給', enables: '可能化', depends_on: '依存', complements: '補完', competes: '競合' },
  en: { supplies: 'supplies', enables: 'enables', depends_on: 'depends on', complements: 'complements', competes: 'competes' },
}

// SOT-1124: 100テーマ横断の構造化サプライチェーンを 大カテゴリ/テーマ/企業 で絞り込んで表示する。
export default function SupplyChainPage() {
  const { t, lang } = useI18n()
  const relLabel = (rt: string) => REL_LABELS[lang]?.[rt] ?? rt
  const [category, setCategory] = useState('')
  const [themeId, setThemeId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [selectedEdge, setSelectedEdge] = useState<number | undefined>(undefined)

  // 選択肢導出のための全 edge（フィルタなし）
  const allQuery = useQuery({
    queryKey: ['supply-chain', 'all'],
    queryFn: () => fetchSupplyChain(),
    staleTime: 1000 * 60 * 30,
  })
  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => fetchCompanies(),
    staleTime: 1000 * 60 * 30,
  })

  // サーバ側フィルタ適用済みの edge
  const filteredQuery = useQuery({
    queryKey: ['supply-chain', 'filtered', category, themeId, companyId],
    queryFn: () => fetchSupplyChain({ category, theme_id: themeId, company_id: companyId }),
    staleTime: 1000 * 60 * 10,
  })

  const all = useMemo(() => allQuery.data ?? [], [allQuery.data])
  const items = useMemo(() => filteredQuery.data ?? [], [filteredQuery.data])

  // 選択肢: カテゴリ（from/to）、テーマ（id+name）
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const e of all) {
      if (e.from_category) set.add(e.from_category)
      if (e.to_category) set.add(e.to_category)
    }
    return Array.from(set).sort()
  }, [all])

  const themeOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of all) {
      if (e.from_theme_id) map.set(e.from_theme_id, e.from_theme_name ?? e.from_theme_id)
      if (e.to_theme_id) map.set(e.to_theme_id, e.to_theme_name ?? e.to_theme_id)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [all])

  const companies = companiesQuery.data ?? []

  // グラフ用 nodes/edges を構造化 edge から組み立てる（node.type=カテゴリで色分け）
  const { nodes, edges } = useMemo(() => {
    const nodeMap = new Map<string, SupplyChainGraphNode>()
    const gedges: SupplyChainGraphEdge[] = []
    for (const e of items) {
      if (!nodeMap.has(e.from_theme_id)) {
        nodeMap.set(e.from_theme_id, {
          id: e.from_theme_id,
          type: e.from_category ?? 'theme',
          label: e.from_theme_name ?? e.from_theme_id,
        })
      }
      if (!nodeMap.has(e.to_theme_id)) {
        nodeMap.set(e.to_theme_id, {
          id: e.to_theme_id,
          type: e.to_category ?? 'theme',
          label: e.to_theme_name ?? e.to_theme_id,
        })
      }
      gedges.push({
        source: e.from_theme_id,
        target: e.to_theme_id,
        relation: e.relation_type,
        evidence: e.evidence ?? [],
      })
    }
    return { nodes: Array.from(nodeMap.values()), edges: gedges }
  }, [items])

  const resetSelection = () => setSelectedEdge(undefined)

  if (allQuery.isLoading) return <PageLoading />
  if (allQuery.error) return <PageError onRetry={() => allQuery.refetch()} />

  const selected: SupplyChainItem | undefined =
    selectedEdge !== undefined ? items[selectedEdge] : undefined

  const fmtConfidence = (c: number) => `${Math.round((c ?? 0) * 100)}%`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{t('supplyChain.title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('supplyChain.subtitle')}</p>
      </div>

      {/* 絞り込み */}
      <div className="flex flex-wrap items-center gap-3 bg-surface rounded-xl border border-border/80 shadow-card p-3">
        <div className="flex items-center gap-2">
          <label htmlFor="sc-category" className="shrink-0 text-sm text-muted-foreground">{t('supplyChain.filterCategory')}</label>
          <select
            id="sc-category"
            value={category}
            onChange={e => { setCategory(e.target.value); resetSelection() }}
            className="min-w-0 max-w-[14rem] truncate rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">{t('supplyChain.all')}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sc-theme" className="shrink-0 text-sm text-muted-foreground">{t('supplyChain.filterTheme')}</label>
          <select
            id="sc-theme"
            value={themeId}
            onChange={e => { setThemeId(e.target.value); resetSelection() }}
            className="min-w-0 max-w-[16rem] truncate rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">{t('supplyChain.all')}</option>
            {themeOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sc-company" className="shrink-0 text-sm text-muted-foreground">{t('supplyChain.filterCompany')}</label>
          <select
            id="sc-company"
            value={companyId}
            onChange={e => { setCompanyId(e.target.value); resetSelection() }}
            className="min-w-0 max-w-[16rem] truncate rounded-md border border-gray-300 bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="">{t('supplyChain.all')}</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {(category || themeId || companyId) && (
          <button
            type="button"
            onClick={() => { setCategory(''); setThemeId(''); setCompanyId(''); resetSelection() }}
            className="text-sm text-sky-600 hover:underline"
          >
            {t('supplyChain.clear')}
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{t('supplyChain.edgeCount')}: {items.length}</span>
      </div>

      <ChartCard title={t('supplyChain.graphTitle')} subtitle={t('supplyChain.graphHint')}>
        {items.length === 0 ? (
          <PageEmpty message={t('supplyChain.empty')} />
        ) : (
          <SupplyChainGraphView
            nodes={nodes}
            edges={edges}
            onEdgeClick={setSelectedEdge}
            selectedEdgeIndex={selectedEdge}
          />
        )}
      </ChartCard>

      {/* 選択 edge の根拠 */}
      {selected && (
        <ChartCard title={t('supplyChain.edgeDetail')}>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-blue-50 text-blue-800 px-2 py-1 rounded">{selected.from_theme_name}</span>
              <span className="text-muted-foreground">→</span>
              <span className="bg-green-50 text-green-800 px-2 py-1 rounded">{selected.to_theme_name}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-w-md">
              <span className="text-muted-foreground">{t('supplyChain.relationType')}</span>
              <span className="font-medium">{relLabel(selected.relation_type)}</span>
              <span className="text-muted-foreground">{t('supplyChain.confidence')}</span>
              <span className="font-medium">{fmtConfidence(selected.confidence)}</span>
              <span className="text-muted-foreground">{t('supplyChain.createdAt')}</span>
              <span className="font-medium">{selected.created_at ?? '—'}</span>
            </div>
            {selected.evidence && selected.evidence.length > 0 && (
              <div>
                <p className="text-muted-foreground">{t('supplyChain.evidence')}</p>
                <ul className="list-disc list-inside text-foreground">
                  {selected.evidence.map((ev, i) => <li key={i}>{ev}</li>)}
                </ul>
              </div>
            )}
            {selected.relationship && <p className="text-muted-foreground text-xs">{selected.relationship}</p>}
          </div>
        </ChartCard>
      )}

      {/* edge 一覧（根拠/関係タイプ/信頼度/作成日） */}
      <ChartCard title={t('supplyChain.listTitle')}>
        {items.length === 0 ? (
          <PageEmpty message={t('supplyChain.empty')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">{t('supplyChain.colFrom')}</th>
                  <th className="py-2 pr-3">{t('supplyChain.colTo')}</th>
                  <th className="py-2 pr-3">{t('supplyChain.relationType')}</th>
                  <th className="py-2 pr-3">{t('supplyChain.confidence')}</th>
                  <th className="py-2 pr-3">{t('supplyChain.createdAt')}</th>
                  <th className="py-2 pr-3">{t('supplyChain.evidence')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e, i) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedEdge(i)}
                    className={`border-b border-gray-100 cursor-pointer hover:bg-surface-muted ${selectedEdge === i ? 'bg-sky-50' : ''}`}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">{e.from_theme_name}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{e.to_theme_name}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{relLabel(e.relation_type)}</td>
                    <td className="py-2 pr-3 nums">{fmtConfidence(e.confidence)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{e.created_at ?? '—'}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{(e.evidence ?? []).join(' / ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
