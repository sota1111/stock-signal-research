import { useMemo } from 'react'
import { EmptyChart } from './ChartCard'
import { relationColor, confidenceStroke } from './chartUtils'
import type { SupplyChainItem } from '../../types'
import { useI18n } from '../../i18n/useI18n'

/** SOT-1142 (案B): ノードを大カテゴリごとの縦レーンに配置するスイムレーン図。
 * カテゴリ構造を一目で把握できる。線色=relation_type、太さ∝confidence。 */
export default function SupplyChainSwimlane({
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
    const cat = new Map<string, string>()
    const label = new Map<string, string>()
    for (const e of items) {
      if (!cat.has(e.from_theme_id)) cat.set(e.from_theme_id, e.from_category ?? '—')
      if (!cat.has(e.to_theme_id)) cat.set(e.to_theme_id, e.to_category ?? '—')
      label.set(e.from_theme_id, e.from_theme_name ?? e.from_theme_id)
      label.set(e.to_theme_id, e.to_theme_name ?? e.to_theme_id)
    }
    const categories = Array.from(new Set(Array.from(cat.values()))).sort()
    const laneOf = new Map(categories.map((c, i) => [c, i]))

    const byCat = new Map<string, string[]>()
    for (const [id, c] of cat.entries()) {
      if (!byCat.has(c)) byCat.set(c, [])
      byCat.get(c)!.push(id)
    }

    const laneW = 180
    const rowGap = 28
    const headerH = 26
    const padX = 12
    const padY = headerH + 14
    const maxRows = Math.max(1, ...Array.from(byCat.values()).map(a => a.length))
    const W = padX * 2 + categories.length * laneW
    const H = padY + maxRows * rowGap + 12

    const pos = new Map<string, { x: number; y: number }>()
    for (const [c, ids] of byCat.entries()) {
      ids.sort((a, b) => (label.get(a) ?? '').localeCompare(label.get(b) ?? ''))
      const li = laneOf.get(c)!
      ids.forEach((id, ri) => {
        pos.set(id, { x: padX + li * laneW + 18, y: padY + ri * rowGap })
      })
    }

    return { categories, pos, label, W, H, laneW, padX, headerH }
  }, [items])

  if (!items || items.length === 0) return <EmptyChart message={t('chart.empty.supplyChain')} />

  const { categories, pos, label, W, H, laneW, padX, headerH } = layout

  return (
    <div className="overflow-auto" style={{ maxHeight: 560 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t('chart.aria.supplyChain')}>
        {categories.map((c, i) => (
          <g key={c}>
            <rect x={padX + i * laneW} y={0} width={laneW} height={H} fill={i % 2 ? '#f8fafc' : '#ffffff'} />
            <text x={padX + i * laneW + laneW / 2} y={headerH - 9} textAnchor="middle" fontSize={11} fontWeight={600} fill="#334155">
              {c.length > 19 ? `${c.slice(0, 18)}…` : c}
            </text>
          </g>
        ))}
        {items.map((e, i) => {
          const a = pos.get(e.from_theme_id)
          const b = pos.get(e.to_theme_id)
          if (!a || !b) return null
          const mx = (a.x + b.x) / 2
          const selected = selectedIndex === i
          return (
            <path
              key={i}
              d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`}
              fill="none"
              stroke={relationColor(e.relation_type)}
              strokeWidth={confidenceStroke(e.confidence)}
              strokeOpacity={selected ? 0.95 : 0.35}
              onClick={onEdgeClick ? () => onEdgeClick(i) : undefined}
              style={onEdgeClick ? { cursor: 'pointer' } : undefined}
            />
          )
        })}
        {Array.from(pos.entries()).map(([id, p]) => {
          const lbl = label.get(id) ?? id
          return (
            <g key={id}>
              <circle cx={p.x} cy={p.y} r={5} fill="#475569" />
              <text x={p.x + 9} y={p.y} dominantBaseline="middle" fontSize={9.5} fill="#1f2937">
                {lbl.length > 17 ? `${lbl.slice(0, 16)}…` : lbl}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
