import { useState, useEffect, type ReactNode } from 'react'
import { AuthContext, AuthError, type AuthErrorCode } from './authContextValue'

// HTTP ステータスを安定したエラーコードに分類する（SOT-995 提案B-1）。
function classifyStatus(status: number): AuthErrorCode {
  if (status === 401) return 'INVALID_CREDENTIALS'
  if (status === 403) return 'FORBIDDEN_EMAIL'
  if (status === 429) return 'TOO_MANY_ATTEMPTS'
  if (status >= 500) return 'SERVER_ERROR'
  return 'INVALID_CREDENTIALS'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => {
        if (!active) return
        setIsAuthenticated(res.ok)
        if (!res.ok) setEmail(null)
      })
      .catch(() => {
        if (!active) return
        setIsAuthenticated(false)
        setEmail(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const login = async (emailAddr: string, password: string) => {
    let res: Response
    try {
      res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: emailAddr, password }),
      })
    } catch {
      // fetch 自体の失敗はネットワーク不達として分類する。
      throw new AuthError('NETWORK_ERROR')
    }
    if (!res.ok) {
      throw new AuthError(classifyStatus(res.status))
    }
    setIsAuthenticated(true)
    setEmail(emailAddr)
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setIsAuthenticated(false)
    setEmail(null)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, email, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
