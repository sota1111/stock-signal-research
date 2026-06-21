import { createContext } from "react"

// Stable auth failure codes mapped to i18n strings by the UI (SOT-995 提案B-1).
export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN_EMAIL'
  | 'TOO_MANY_ATTEMPTS'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'

export class AuthError extends Error {
  code: AuthErrorCode
  constructor(code: AuthErrorCode) {
    super(code)
    this.name = 'AuthError'
    this.code = code
  }
}

export interface AuthContextType {
  isAuthenticated: boolean
  // 認証チェック中（/api/auth/me 解決前）は true。確定前のリダイレクトを防ぐ（SOT-995 提案B-3）。
  loading: boolean
  email: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  loading: true,
  email: null,
  login: async () => {},
  logout: () => {},
})
