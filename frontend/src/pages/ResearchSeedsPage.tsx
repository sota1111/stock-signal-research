import { useQuery } from '@tanstack/react-query'
import { fetchResearchSeeds } from '../api'
import type { ResearchSeed } from '../types'

const CONFIDENCE_STYLE: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600 border-gray-300',
  medium: 'bg-amber-100 text-amber-700 border-amber-300',
  high: 'bg-green-100 text-green-700 border-green-300',
}

function ConfidenceBadge({ confidence }: { confidence?: string }) {
  const style = CONFIDENCE_STYLE[confidence ?? ''] ?? CONFIDENCE_STYLE.low
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${style}`}>
      confidence: {confidence ?? 'low'}
    </span>
  )
}

function SeedCard({ seed }: { seed: ResearchSeed }) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{seed.theme}</h2>
          <p className="text-sm text-gray-500">
            {seed.symbol && <span className="font-mono mr-2">{seed.symbol}</span>}
            {seed.company_name}
          </p>
        </div>
        <ConfidenceBadge confidence={seed.confidence} />
      </div>

      {seed.related_keywords?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {seed.related_keywords.map(k => (
            <span key={k} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{k}</span>
          ))}
        </div>
      )}

      {seed.summary && <p className="text-sm text-gray-700 mb-3">{seed.summary}</p>}

      <dl className="space-y-1 text-sm">
        {seed.hypothesis && (
          <div className="flex gap-2">
            <dt className="text-gray-500 shrink-0 w-20">仮説</dt>
            <dd className="text-gray-700">{seed.hypothesis}</dd>
          </div>
        )}
        {seed.reason_to_track && (
          <div className="flex gap-2">
            <dt className="text-gray-500 shrink-0 w-20">追跡理由</dt>
            <dd className="text-gray-700">{seed.reason_to_track}</dd>
          </div>
        )}
        {seed.source_reference && (
          <div className="flex gap-2">
            <dt className="text-gray-500 shrink-0 w-20">出典/履歴</dt>
            <dd className="text-gray-600">{seed.source_reference}</dd>
          </div>
        )}
      </dl>

      {seed.papers?.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">関連論文</p>
          <ul className="list-disc list-inside text-xs text-gray-600">
            {seed.papers.map((p, i) => (
              <li key={i}>{p.title}{p.year ? ` (${p.year})` : ''}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 pt-2 border-t text-xs text-gray-400">
        登録日時: {seed.created_at ?? '—'}
      </div>
    </div>
  )
}

export default function ResearchSeedsPage() {
  const { data: seeds, isLoading, isError } = useQuery({
    queryKey: ['research-seeds'],
    queryFn: fetchResearchSeeds,
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">初期リサーチ (seed)</h1>
      <p className="text-sm text-gray-500 mb-6">
        過去履歴から抽出した初期データ。本データは調査・仮説検証用であり投資助言ではありません。
      </p>

      {isLoading && <p className="text-gray-500">読み込み中...</p>}
      {isError && <p className="text-red-600">データの取得に失敗しました。</p>}

      {seeds && seeds.length === 0 && (
        <p className="text-gray-500">初期リサーチデータがありません。</p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {seeds?.map(seed => <SeedCard key={seed.id} seed={seed} />)}
      </div>
    </div>
  )
}
