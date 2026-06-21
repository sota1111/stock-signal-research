import { EmptyChart } from './ChartCard'
import { SERIES_COLORS } from './chartUtils'
import type { SupplyChainGraphNode, SupplyChainGraphEdge } from '../../types'
import { useI18n } from '../../i18n/useI18n'

/** C2: サプライチェーン連鎖を円形レイアウトのノード/エッジ図で描画（recharts非依存の軽量SVG）。 */
export default function SupplyChainGraphView({
  nodes,
  edges,
}: {
  nodes: SupplyChainGraphNode[]
  edges: SupplyChainGraphEdge[]
}) {
  const { t } = useI18n()
  if (!nodes || nodes.length === 0) return <EmptyChart message={t('chart.empty.supplyChain')} />

  const W = 640
  const H = 380
  const cx = W / 2
  const cy = H / 2
  const radius = Math.min(W, H) / 2 - 70

  // ノードを円周上に配置
  const pos = new Map<string, { x: number; y: number }>()
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
    pos.set(n.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) })
  })

  // typeごとに色を割り当てる
  const types = Array.from(new Set(nodes.map(n => n.type)))
  const colorOf = (type: string) => SERIES_COLORS[types.indexOf(type) % SERIES_COLORS.length]

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 360 }} role="img" aria-label={t('chart.aria.supplyChain')}>
        <defs>
          <marker id="sc-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L7,3 L0,6 Z" fill="#94a3b8" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const a = pos.get(e.source)
          const b = pos.get(e.target)
          if (!a || !b) return null
          const mx = (a.x + b.x) / 2
          const my = (a.y + b.y) / 2
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cbd5e1" strokeWidth={1.5} markerEnd="url(#sc-arrow)" />
              {e.relation && (
                <text x={mx} y={my - 2} textAnchor="middle" fontSize={9} fill="#64748b">
                  {e.relation}
                </text>
              )}
            </g>
          )
        })}
        {nodes.map(n => {
          const p = pos.get(n.id)!
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={8} fill={colorOf(n.type)} />
              <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize={11} fill="#1f2937" fontWeight={600}>
                {n.label}
              </text>
              <text x={p.x} y={p.y + 20} textAnchor="middle" fontSize={9} fill="#94a3b8">
                {n.type}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
