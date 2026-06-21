import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { AuthError, type AuthErrorCode } from '../contexts/authContextValue'
import { useI18n } from '../i18n/useI18n'
import type { MessageKey } from '../i18n/messages'
import LanguageToggle from '../components/LanguageToggle'

// エラーコード → i18n キーのマッピング（SOT-995 提案B-1）。
const ERROR_MESSAGE_KEY: Record<AuthErrorCode, MessageKey> = {
  INVALID_CREDENTIALS: 'login.invalidCredentials',
  FORBIDDEN_EMAIL: 'login.error.forbidden',
  TOO_MANY_ATTEMPTS: 'login.error.tooMany',
  SERVER_ERROR: 'login.error.server',
  NETWORK_ERROR: 'login.error.network',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type LocationState = { from?: { pathname?: string; search?: string } }

export default function LoginPage() {
  const { login, isAuthenticated, loading: authLoading } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)

  // ログイン成功前にアクセスしようとした元ページ（PrivateRoute の state.from / ?redirect クエリ）を解決する。
  const resolveTarget = (): string => {
    const state = location.state as LocationState | null
    if (state?.from?.pathname) {
      return `${state.from.pathname}${state.from.search ?? ''}`
    }
    const redirect = new URLSearchParams(location.search).get('redirect')
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      return redirect
    }
    return '/'
  }

  // 既に認証済み（ログイン保持）の場合は元ページへ即遷移する（SOT-995 提案B-3）。
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(resolveTarget(), { replace: true })
    }
    // resolveTarget は location 依存。location/auth の変化時のみ再評価する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated])

  const validate = (): boolean => {
    let ok = true
    if (!email.trim()) {
      setEmailError(t('login.validation.emailRequired'))
      ok = false
    } else if (!EMAIL_RE.test(email.trim())) {
      setEmailError(t('login.validation.emailInvalid'))
      ok = false
    } else {
      setEmailError('')
    }
    if (!password) {
      setPasswordError(t('login.validation.passwordRequired'))
      ok = false
    } else {
      setPasswordError('')
    }
    return ok
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate(resolveTarget(), { replace: true })
    } catch (err: unknown) {
      if (err instanceof AuthError) {
        setError(t(ERROR_MESSAGE_KEY[err.code]))
      } else {
        setError(t('login.failed'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="absolute top-4 right-4">
        <LanguageToggle variant="light" />
      </div>
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center">
        {/* 簡易ヒーロー: 何のツールかを伝える（SOT-995 提案B-5） */}
        <div className="hidden md:flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-lg font-extrabold text-white">S</span>
            <span className="text-lg font-bold text-slate-800">Stock Signal Research</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 leading-snug">{t('login.hero.tagline')}</h2>
          <p className="text-slate-600">{t('login.hero.desc')}</p>
          <ul className="space-y-2">
            {(['login.hero.feature1', 'login.hero.feature2', 'login.hero.feature3'] as const).map(key => (
              <li key={key} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 text-sky-500">✓</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8 w-full max-w-sm mx-auto">
          <div className="flex flex-col items-center mb-6">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-lg font-extrabold text-white mb-3 md:hidden">S</span>
            <h1 className="text-xl font-bold text-slate-800 text-center">
              Stock Signal Research
            </h1>
            <p className="text-sm text-slate-500 mt-1">{t('login.subtitle')}</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('login.email')}
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                aria-invalid={!!emailError}
                className={`w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${emailError ? 'border-red-400' : 'border-gray-300'}`}
                placeholder="your-email@example.com"
              />
              {emailError && <p className="text-red-600 text-xs mt-1">{emailError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('login.password')}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  aria-invalid={!!passwordError}
                  className={`w-full border rounded px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${passwordError ? 'border-red-400' : 'border-gray-300'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  {showPassword ? t('login.hidePassword') : t('login.showPassword')}
                </button>
              </div>
              {passwordError && <p className="text-red-600 text-xs mt-1">{passwordError}</p>}
            </div>
            {error && <p className="text-red-600 text-sm" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white rounded py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
