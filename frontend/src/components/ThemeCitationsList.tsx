import { useState } from 'react'
import type { ThemeCitationSummary } from '../types'

/**
 * SOT-899: テーマ別「引用数上位100論文の総引用数」と、その上位論文（link/概要/引用数）を表示する。
 * 論文「件数」ではなく「引用数」を主指標として見せるためのコンポーネント。
 */
function ThemeBlock({ theme }: { theme: ThemeCitationSummary }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? theme.top_papers : theme.top_papers.slice(0, 5)

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 truncate" title={theme.theme_name}>{theme.theme_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">上位{theme.paper_count}論文</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-sky-700">{theme.total_citations.toLocaleString()}</p>
          <p className="text-xs text-gray-400">総引用数</p>
        </div>
      </div>

      {theme.top_papers.length === 0 ? (
        <p className="text-xs text-gray-400 mt-3">引用データのある論文がありません。</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map((p, i) => (
            <li key={p.paper_id || i} className="border-t border-gray-100 pt-2">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={p.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-sky-600 hover:underline line-clamp-2"
                  title={p.title}
                >
                  {p.title || '(無題)'}
                </a>
                <span className="shrink-0 text-xs font-semibold text-gray-600">{p.citation_count.toLocaleString()} 引用</span>
              </div>
              {p.abstract && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.abstract}</p>}
            </li>
          ))}
        </ul>
      )}

      {theme.top_papers.length > 5 && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-3 text-xs text-sky-600 hover:underline"
        >
          {expanded ? '折りたたむ' : `さらに表示（残り${theme.top_papers.length - 5}件）`}
        </button>
      )}
    </div>
  )
}

export default function ThemeCitationsList({ themes }: { themes: ThemeCitationSummary[] }) {
  if (!themes || themes.length === 0) {
    return (
      <p className="text-sm text-gray-400">引用数データがありません。論文収集ジョブの実行後に表示されます。</p>
    )
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {themes.map(theme => (
        <ThemeBlock key={theme.theme_id ?? theme.theme_name} theme={theme} />
      ))}
    </div>
  )
}
