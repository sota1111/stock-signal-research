import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FilterContext } from './filterContextValue'

// URL search params をストアとしてテーマ/年レンジを共有する（SOT-997 / 提案A-3）。
// react-router の useSearchParams を使うため BrowserRouter の内側に置くこと。
const PARAM_THEME = 'theme'
const PARAM_THEME_ID = 'theme_id'
const PARAM_FROM = 'from_year'
const PARAM_TO = 'to_year'

function parseYear(value: string | null): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams()

  const theme = searchParams.get(PARAM_THEME) ?? ''
  const themeId = searchParams.get(PARAM_THEME_ID) ?? ''
  const fromYear = parseYear(searchParams.get(PARAM_FROM))
  const toYear = parseYear(searchParams.get(PARAM_TO))

  // 既存のクエリを保ったまま一部のキーだけ更新/削除する。
  const patch = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(updates)) {
            if (value == null || value === '') next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setTheme = useCallback((name: string) => patch({ [PARAM_THEME]: name }), [patch])
  const setThemeId = useCallback((id: string) => patch({ [PARAM_THEME_ID]: id }), [patch])
  const setYearRange = useCallback(
    (from: number | null, to: number | null) =>
      patch({ [PARAM_FROM]: from == null ? null : String(from), [PARAM_TO]: to == null ? null : String(to) }),
    [patch],
  )
  const setThemeContext = useCallback(
    (ctx: { theme?: string; themeId?: string }) =>
      patch({
        ...(ctx.theme !== undefined ? { [PARAM_THEME]: ctx.theme } : {}),
        ...(ctx.themeId !== undefined ? { [PARAM_THEME_ID]: ctx.themeId } : {}),
      }),
    [patch],
  )

  const value = useMemo(
    () => ({ theme, themeId, fromYear, toYear, setTheme, setThemeId, setYearRange, setThemeContext }),
    [theme, themeId, fromYear, toYear, setTheme, setThemeId, setYearRange, setThemeContext],
  )

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}
