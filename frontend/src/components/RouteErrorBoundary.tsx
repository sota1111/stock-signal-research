import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'

const CHUNK_RELOAD_FLAG = 'ssr_chunk_reload'
// 古いチャンクを参照するキャッシュ済み index.html を確実にバイパスして再取得するためのワンショット query。
// 値はタイムスタンプ。アプリ起動時に下の stripCacheBustParam() で URL から取り除く。
const CACHE_BUST_PARAM = 'cb'
const STALE_CHUNK_MESSAGES = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Loading chunk',
]

// アプリ起動時に、過去のキャッシュバスト reload で付与した query を URL から取り除く（履歴を汚さない）。
// RouteErrorBoundary は App から static import されるため、最初のレンダリング前にここが一度走る。
;(function stripCacheBustParam() {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.has(CACHE_BUST_PARAM)) {
      url.searchParams.delete(CACHE_BUST_PARAM)
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    }
  } catch {
    // URL 解析に失敗しても致命的ではないので無視する。
  }
})()

// stale-chunk エラー時の復旧 reload。単純な location.reload() は heuristically/CDN キャッシュされた
// 古い index.html（削除済みチャンクハッシュを参照）をそのまま再利用してしまい復旧しないことがある。
// ワンショットの cache-bust query を付けて別 URL として読み込み、必ず最新の index.html を取得させる。
function reloadBustingCache() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.set(CACHE_BUST_PARAM, Date.now().toString())
    window.location.replace(url.toString())
  } catch {
    window.location.reload()
  }
}

type RouteErrorBoundaryProps = {
  children: ReactNode
}

type RouteErrorBoundaryState = {
  error: Error | null
}

function isStaleChunkError(error: Error) {
  return error.name === 'ChunkLoadError' || STALE_CHUNK_MESSAGES.some(message => error.message.includes(message))
}

function getReloadedPaths() {
  try {
    const raw = window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)
    if (!raw) return []
    const paths = JSON.parse(raw)
    return Array.isArray(paths) ? paths.filter((path): path is string => typeof path === 'string') : []
  } catch {
    return []
  }
}

function hasReloadedCurrentPath() {
  return getReloadedPaths().includes(window.location.pathname)
}

function markCurrentPathReloaded() {
  try {
    const paths = new Set(getReloadedPaths())
    paths.add(window.location.pathname)
    window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, JSON.stringify([...paths]))
  } catch {
    // If sessionStorage is unavailable, still show the fallback instead of risking a reload loop.
  }
}

function RouteErrorFallback() {
  const { t } = useI18n()

  return (
    <div className="mx-auto max-w-md text-center py-16">
      <div className="text-3xl mb-2" aria-hidden>⚠️</div>
      <p className="font-semibold text-foreground">{t('error.routeTitle')}</p>
      <p className="text-sm text-muted-foreground mt-1">{t('error.routeBody')}</p>
      <button
        type="button"
        onClick={reloadBustingCache}
        className="mt-4 rounded-md border border-slate-300 bg-surface px-4 py-1.5 text-sm text-foreground hover:bg-surface-muted"
      >
        {t('error.reload')}
      </button>
    </div>
  )
}

export default class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return {
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Keep the error visible in development logs while replacing the blank route tree with recovery UI.
    // isStaleChunkError は判定ヒント（ログ用）に留める。SOT-1143: 復旧トリガはメッセージ一致ではなく
    // 「このパスでまだ自動リロードしていない」かどうかにする。ブラウザ/ロケール差でメッセージが
    // 一致しない stale-chunk でも確実に1回だけ最新 index.html を取りに行く。
    console.error('Route render failed', error, errorInfo, { staleChunk: isStaleChunkError(error) })

    // ループ防止は hasReloadedCurrentPath() の「パス毎に1回だけ」ガードが担う。
    // 真に決定的な描画エラーでも最大1回の cache-bust reload で済み、その後はフォールバックUIを出す。
    if (hasReloadedCurrentPath()) return

    markCurrentPathReloaded()
    reloadBustingCache()
  }

  render() {
    if (this.state.error) return <RouteErrorFallback />

    return this.props.children
  }
}
