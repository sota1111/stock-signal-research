import type { ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'

// 共通の読み込み中 / エラー / 空表示コンポーネント（SOT-996 / 提案A-4）。
// 各ページがインラインで持っていた loading/error/empty 表示を統一する。

export function PageLoading({ message }: { message?: string }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500" role="status" aria-live="polite">
      <span className="h-8 w-8 mb-3 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
      <p className="text-sm">{message ?? t('common.loading')}</p>
    </div>
  )
}

export function PageError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-md text-center py-16">
      <div className="text-3xl mb-2" aria-hidden>⚠️</div>
      <p className="font-semibold text-slate-700">{message ?? t('common.loadError')}</p>
      <p className="text-sm text-slate-400 mt-1">{t('common.retryLater')}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('common.retry')}
        </button>
      )}
    </div>
  )
}

export function PageEmpty({ message, action }: { message?: string; action?: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-slate-400">
      <p>{message ?? t('common.empty')}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// React Query などの状態から表示を一括で出し分ける薄いラッパー。
// loading/error/empty のいずれでもない場合に children を描画する。
export function AsyncState({
  isLoading,
  isError,
  isEmpty,
  loadingMessage,
  errorMessage,
  emptyMessage,
  emptyAction,
  onRetry,
  children,
}: {
  isLoading: boolean
  isError?: boolean
  isEmpty?: boolean
  loadingMessage?: string
  errorMessage?: string
  emptyMessage?: string
  emptyAction?: ReactNode
  onRetry?: () => void
  children: ReactNode
}) {
  if (isLoading) return <PageLoading message={loadingMessage} />
  if (isError) return <PageError message={errorMessage} onRetry={onRetry} />
  if (isEmpty) return <PageEmpty message={emptyMessage} action={emptyAction} />
  return <>{children}</>
}
