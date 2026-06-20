import { useCallback, useMemo, useState } from 'react'
import { I18nContext } from './i18nContextValue'
import { messages, type Lang, type MessageKey } from './messages'

const STORAGE_KEY = 'ssr.lang'

function readInitialLang(): Lang {
  if (typeof window === 'undefined') return 'ja'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  return saved === 'en' ? 'en' : 'ja'
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang)

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore storage errors (private mode etc.)
    }
  }, [])

  const toggleLang = useCallback(() => {
    setLang(lang === 'ja' ? 'en' : 'ja')
  }, [lang, setLang])

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => {
      let text: string = messages[lang][key] ?? messages.ja[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
        }
      }
      return text
    },
    [lang],
  )

  const value = useMemo(() => ({ lang, setLang, toggleLang, t }), [lang, setLang, toggleLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
