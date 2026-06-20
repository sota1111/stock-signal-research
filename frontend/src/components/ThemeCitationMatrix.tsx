import type { ThemeCitationMatrix as ThemeCitationMatrixData } from '../types'

/**
 * SOT-944: テーマ×年の引用数合計を行列（マトリクス）形式で表示する。
 * 行=テーマ / 列=直近の年 / セル=その年の引用数合計。値の大きさで背景色を濃くする
 * ヒートマップ。テーマ別合計（行合計）と年別合計（列合計）も併記する。
 */

// セル値を最大値で正規化し、sky系の濃淡クラスを返す（0は無着色）。
function cellClass(value: number, max: number): string {
  if (value <= 0 || max <= 0) return 'text-gray-300'
  const ratio = value / max
  if (ratio > 0.66) return 'bg-sky-600 text-white'
  if (ratio > 0.33) return 'bg-sky-400 text-white'
  if (ratio > 0.1) return 'bg-sky-200 text-sky-900'
  return 'bg-sky-50 text-sky-900'
}

export default function ThemeCitationMatrix({ data }: { data: ThemeCitationMatrixData }) {
  if (!data || data.rows.length === 0 || data.years.length === 0) {
    return (
      <p className="text-sm text-gray-400">引用数データがありません。論文収集ジョブの実行後に表示されます。</p>
    )
  }

  const maxCell = Math.max(1, ...data.rows.flatMap(r => r.cells))

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left font-semibold text-gray-600">
              テーマ
            </th>
            {data.years.map(y => (
              <th key={y} className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap">
                {y}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right font-semibold text-gray-700 whitespace-nowrap">合計</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map(row => (
            <tr key={row.theme_id ?? row.theme_name} className="border-t border-gray-100">
              <td
                className="sticky left-0 z-10 bg-white px-2 py-1 text-left text-gray-700 max-w-[10rem] truncate"
                title={row.theme_name}
              >
                {row.theme_name}
              </td>
              {row.cells.map((c, i) => (
                <td
                  key={data.years[i]}
                  className={`px-2 py-1 text-right tabular-nums ${cellClass(c, maxCell)}`}
                >
                  {c > 0 ? c.toLocaleString() : '-'}
                </td>
              ))}
              <td className="px-2 py-1 text-right font-semibold text-gray-800 tabular-nums whitespace-nowrap">
                {row.total.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200">
            <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left font-semibold text-gray-700">
              合計
            </td>
            {data.column_totals.map((c, i) => (
              <td key={data.years[i]} className="px-2 py-1.5 text-right font-semibold text-gray-600 tabular-nums">
                {c.toLocaleString()}
              </td>
            ))}
            <td className="px-2 py-1.5 text-right font-bold text-sky-700 tabular-nums whitespace-nowrap">
              {data.grand_total.toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
