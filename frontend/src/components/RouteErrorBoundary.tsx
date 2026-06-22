import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'

const CHUNK_RELOAD_FLAG = 'ssr_chunk_reload'
const STALE_CHUNK_MESSAGES = [
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Loading chunk',
]

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
      <p className="font-semibold text-slate-700">{t('error.routeTitle')}</p>
      <p className="text-sm text-slate-400 mt-1">{t('error.routeBody')}</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
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
    console.error('Route render failed', error, errorInfo)

    if (!isStaleChunkError(error) || hasReloadedCurrentPath()) return

    markCurrentPathReloaded()
    window.location.reload()
  }

  render() {
    if (this.state.error) return <RouteErrorFallback />

    return this.props.children
  }
}
