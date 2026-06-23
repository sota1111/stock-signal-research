import type { ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'

// 共通の読み込み中 / エラー / 空表示コンポーネント（SOT-996 / 提案A-4）。
// 各ページがインラインで持っていた loading/error/empty 表示を統一する。

export function PageLoading({ message }: { message?: string }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground" role="status" aria-live="polite">
      <span className="h-8 w-8 mb-3 rounded-full border-2 border-slate-300 border-t-sky-500 animate-spin" aria-hidden />
      <p className="text-sm">{message ?? t('common.loading')}</p>
    </div>
  )
}

// チャート形状のスケルトン（SOT-1019 / 提案5）。テキストスピナーの代わりに、
// チャートカードの読み込み中をバー＋軸のシルエットで示す。`.skeleton` は index.css 定義。
export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div className="w-full" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-end gap-2" style={{ height }}>
        {[60, 85, 45, 95, 70, 55, 80, 40].map((h, i) => (
          <div key={i} className="skeleton flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="skeleton mt-3 h-3 w-1/3" />
    </div>
  )
}

export function PageError({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-md text-center py-16">
      <div className="text-3xl mb-2" aria-hidden>⚠️</div>
      <p className="font-semibold text-foreground">{message ?? t('common.loadError')}</p>
      <p className="text-sm text-muted-foreground mt-1">{t('common.retryLater')}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded-md border border-slate-300 bg-surface px-4 py-1.5 text-sm text-foreground hover:bg-surface-muted"
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
    <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-muted-foreground">
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
