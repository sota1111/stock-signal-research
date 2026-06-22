/** @type {import('tailwindcss').Config} */
// Design-language renewal (SOT-1019). Tokens are defined as CSS variables in
// src/index.css so light/dark themes can swap them; Tailwind references them here
// so utility classes (text-brand, bg-surface, shadow-card …) stay in sync.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Noto Sans JP"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        brand: 'var(--brand)',
        'brand-strong': 'var(--brand-strong)',
        up: 'var(--up)',
        down: 'var(--down)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
      },
    },
  },
  plugins: [],
}
