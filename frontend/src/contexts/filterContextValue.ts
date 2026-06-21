import { createContext } from 'react'

// テーマ選択・表示年レンジをページ間で共有するグローバルフィルタ（SOT-997 / 提案A-3）。
// 値は URL の search params に永続化されるため、ページ遷移しても選択が消えない。
export interface FilterContextType {
  // テーマ名（Dashboard / Papers の signal-report はテーマ名で問い合わせる）。'' = 未選択
  theme: string
  // テーマID（Patents など theme_id ベースのページ用）。'' = 未選択 / 全テーマ
  themeId: string
  // 表示年レンジ。null = 未選択（データから導出した全期間を使う）
  fromYear: number | null
  toYear: number | null
  setTheme: (name: string) => void
  setThemeId: (id: string) => void
  setYearRange: (from: number | null, to: number | null) => void
  // テーマ詳細などからの遷移時にテーマ名・IDをまとめて設定する
  setThemeContext: (ctx: { theme?: string; themeId?: string }) => void
}

export const FilterContext = createContext<FilterContextType>({
  theme: '',
  themeId: '',
  fromYear: null,
  toYear: null,
  setTheme: () => {},
  setThemeId: () => {},
  setYearRange: () => {},
  setThemeContext: () => {},
})
