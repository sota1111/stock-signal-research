import { EmptyChart } from './ChartCard'
import { SERIES_COLORS } from './chartUtils'
import type { SupplyChainGraphNode, SupplyChainGraphEdge } from '../../types'
import { useI18n } from '../../i18n/useI18n'

/** C2: サプライチェーン連鎖を円形レイアウトのノード/エッジ図で描画（recharts非依存の軽量SVG）。
 * SOT-1124: 任意で edge クリック（onEdgeClick）に対応し、根拠/関係タイプ表示パネルと連携できる。 */
export default function SupplyChainGraphView({
  nodes,
  edges,
  onEdgeClick,
  selectedEdgeIndex,
}: {
  nodes: SupplyChainGraphNode[]
  edges: SupplyChainGraphEdge[]
  onEdgeClick?: (index: number) => void
  selectedEdgeIndex?: number
}) {
  const { t } = useI18n()
  if (!nodes || nodes.length === 0) return <EmptyChart message={t('chart.empty.supplyChain')} />

  const W = 640
  const H = 380
  const cx = W / 2
  const cy = H / 2
  const radius = Math.min(W, H) / 2 - 70

  // ノードを円周上に配置。ラベルを図の外側へ放射状に出すため、各ノードの角度と
  // 外向き単位ベクトル(ux, uy)も保持する。
  const pos = new Map<string, { x: number; y: number; ux: number; uy: number }>()
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2
    const ux = Math.cos(angle)
    const uy = Math.sin(angle)
    pos.set(n.id, { x: cx + radius * ux, y: cy + radius * uy, ux, uy })
  })

  // ラベルをノード中心から外向きに離す距離（円の外側に文字を配置して重なりを防ぐ）。
  const LABEL_GAP = 16

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
          const selected = selectedEdgeIndex === i
          return (
            <g
              key={i}
              onClick={onEdgeClick ? () => onEdgeClick(i) : undefined}
              style={onEdgeClick ? { cursor: 'pointer' } : undefined}
            >
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={selected ? '#2563eb' : '#cbd5e1'}
                strokeWidth={selected ? 3 : 1.5}
                markerEnd="url(#sc-arrow)"
              />
              {e.relation && (
                <text x={mx} y={my - 2} textAnchor="middle" fontSize={9} fill={selected ? '#1d4ed8' : '#64748b'}>
                  {e.relation}
                </text>
              )}
            </g>
          )
        })}
        {nodes.map(n => {
          const p = pos.get(n.id)!
          // ラベルの基準点をノード中心から外向き(ux, uy)へずらし、図の外側に文字を出す。
          const lx = p.x + p.ux * LABEL_GAP
          const ly = p.y + p.uy * LABEL_GAP
          // 円の左右どちら側かで text-anchor を切り替え、文字が円の内側へ伸びないようにする。
          const anchor: 'start' | 'middle' | 'end' = p.ux > 0.3 ? 'start' : p.ux < -0.3 ? 'end' : 'middle'
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={8} fill={colorOf(n.type)} />
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize={11} fill="#1f2937" fontWeight={600}>
                {n.label}
              </text>
              <text x={lx} y={ly + 12} textAnchor={anchor} dominantBaseline="middle" fontSize={9} fill="#94a3b8">
                {n.type}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
