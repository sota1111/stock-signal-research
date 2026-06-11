import { useState, useEffect, type ReactNode } from 'react'
import axios from 'axios'
import { AuthContext, TOKEN_KEY } from './authContextValue'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
    axios.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        setIsAuthenticated(true)
        setUsername(res.data.username)
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
      })
  }, [])

  const login = async (user: string, password: string) => {
    const res = await axios.post('/api/auth/login', { username: user, password })
    const token: string = res.data.access_token
    localStorage.setItem(TOKEN_KEY, token)
    setIsAuthenticated(true)
    setUsername(user)
  }

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY)
    setIsAuthenticated(false)
    setUsername(null)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
