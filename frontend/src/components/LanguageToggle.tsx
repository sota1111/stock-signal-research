import { useI18n } from '../i18n/useI18n'

// JP|EN language toggle. Always visible in the header / login screen.
// `variant` adapts colors: "dark" for the dark nav, "light" for light backgrounds.
export default function LanguageToggle({ variant = 'dark' }: { variant?: 'dark' | 'light' }) {
  const { lang, setLang } = useI18n()

  const base = 'px-2 py-0.5 text-xs font-semibold rounded transition-colors'
  const styles =
    variant === 'light'
      ? {
          wrap: 'border-slate-300 bg-slate-100',
          active: 'bg-slate-800 text-white',
          inactive: 'text-muted-foreground hover:text-foreground',
        }
      : {
          wrap: 'border-white/30 bg-white/10',
          active: 'bg-surface text-foreground',
          inactive: 'text-slate-300 hover:text-white',
        }

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded border p-0.5 ${styles.wrap}`}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLang('ja')}
        className={`${base} ${lang === 'ja' ? styles.active : styles.inactive}`}
        aria-pressed={lang === 'ja'}
      >
        JP
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`${base} ${lang === 'en' ? styles.active : styles.inactive}`}
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
    </div>
  )
}
