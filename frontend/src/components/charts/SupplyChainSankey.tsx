import { useMemo } from 'react'
import { EmptyChart } from './ChartCard'
import { relationColor, confidenceStroke } from './chartUtils'
import type { SupplyChainItem } from '../../types'
import { useI18n } from '../../i18n/useI18n'

/** SOT-1142 (案A): サプライチェーンを左→右フローのサンキー風レイヤー図で描画する。
 * recharts 非依存の軽量SVG。リンク色=relation_type、太さ∝confidence。
 * レイヤー割当は「後退辺を上限でクランプする最長路緩和」で行い、循環(competes 等)に対しても破綻しない。 */
export default function SupplyChainSankey({
  items,
  onEdgeClick,
  selectedIndex,
}: {
  items: SupplyChainItem[]
  onEdgeClick?: (index: number) => void
  selectedIndex?: number
}) {
  const { t } = useI18n()

  const layout = useMemo(() => {
    const nodeMap = new Map<string, { id: string; label: string }>()
    for (const e of items) {
      if (!nodeMap.has(e.from_theme_id)) nodeMap.set(e.from_theme_id, { id: e.from_theme_id, label: e.from_theme_name ?? e.from_theme_id })
      if (!nodeMap.has(e.to_theme_id)) nodeMap.set(e.to_theme_id, { id: e.to_theme_id, label: e.to_theme_name ?? e.to_theme_id })
    }
    const ids = Array.from(nodeMap.keys())

    // 循環に強い最長路レイヤリング（反復緩和 + 上限クランプ）
    const MAX_LAYER = 6
    const layer = new Map<string, number>(ids.map(id => [id, 0]))
    for (let iter = 0; iter < ids.length; iter++) {
      let changed = false
      for (const e of items) {
        const want = Math.min((layer.get(e.from_theme_id) ?? 0) + 1, MAX_LAYER)
        if (want > (layer.get(e.to_theme_id) ?? 0)) {
          layer.set(e.to_theme_id, want)
          changed = true
        }
      }
      if (!changed) break
    }

    const byLayer = new Map<number, string[]>()
    for (const id of ids) {
      const l = layer.get(id) ?? 0
      if (!byLayer.has(l)) byLayer.set(l, [])
      byLayer.get(l)!.push(id)
    }
    const layers = Array.from(byLayer.keys()).sort((a, b) => a - b)

    const colGap = 210
    const rowGap = 30
    const nodeW = 140
    const nodeH = 16
    const padX = 16
    const padY = 22
    const maxRows = Math.max(1, ...Array.from(byLayer.values()).map(a => a.length))
    const W = padX * 2 + Math.max(0, layers.length - 1) * colGap + nodeW
    const H = padY * 2 + (maxRows - 1) * rowGap + nodeH

    const pos = new Map<string, { x: number; y: number }>()
    layers.forEach((l, ci) => {
      const col = byLayer.get(l)!
      col.sort((a, b) => (nodeMap.get(a)!.label).localeCompare(nodeMap.get(b)!.label))
      col.forEach((id, ri) => {
        pos.set(id, { x: padX + ci * colGap, y: padY + ri * rowGap })
      })
    })

    return { nodeMap, pos, W, H, nodeW, nodeH }
  }, [items])

  if (!items || items.length === 0) return <EmptyChart message={t('chart.empty.supplyChain')} />

  const { nodeMap, pos, W, H, nodeW, nodeH } = layout

  return (
    <div className="overflow-auto" style={{ maxHeight: 560 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t('chart.aria.supplyChain')}>
        {items.map((e, i) => {
          const a = pos.get(e.from_theme_id)
          const b = pos.get(e.to_theme_id)
          if (!a || !b) return null
          const x1 = a.x + nodeW
          const y1 = a.y + nodeH / 2
          const x2 = b.x
          const y2 = b.y + nodeH / 2
          const mx = (x1 + x2) / 2
          const selected = selectedIndex === i
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none"
              stroke={relationColor(e.relation_type)}
              strokeWidth={confidenceStroke(e.confidence)}
              strokeOpacity={selected ? 0.95 : 0.4}
              onClick={onEdgeClick ? () => onEdgeClick(i) : undefined}
              style={onEdgeClick ? { cursor: 'pointer' } : undefined}
            />
          )
        })}
        {Array.from(pos.entries()).map(([id, p]) => {
          const label = nodeMap.get(id)!.label
          return (
            <g key={id}>
              <rect x={p.x} y={p.y} width={nodeW} height={nodeH} rx={3} fill="#475569" />
              <text x={p.x + 5} y={p.y + nodeH / 2} dominantBaseline="middle" fontSize={10} fill="#ffffff">
                {label.length > 21 ? `${label.slice(0, 20)}…` : label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
