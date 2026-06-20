import { createContext } from 'react'
import type { Lang, MessageKey } from './messages'

export interface I18nContextType {
  lang: Lang
  setLang: (lang: Lang) => void
  toggleLang: () => void
  // translate a key; `vars` interpolates {name} placeholders
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nContextType>({
  lang: 'ja',
  setLang: () => {},
  toggleLang: () => {},
  t: (key) => key,
})
