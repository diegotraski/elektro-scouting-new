import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // These resolve to CSS variables defined per-theme in globals.css (:root and .dark),
        // so existing utility classes like bg-bg, text-ink, border-line automatically flip
        // between light and dark values without needing dark: variants sprinkled everywhere.
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        soft: 'rgb(var(--c-soft) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        steel: 'rgb(var(--c-steel) / <alpha-value>)',
        cyan: '#0EC6E0',
        magenta: '#E0399E',
        ground: '#C9963F',
        air: '#4FA3E8',
        success: '#22B07D',
        danger: '#E15571',
        // legacy aliases kept so existing utility classes (bg-gold, text-crimson, etc.) still resolve
        gold: '#C9963F',
        crimson: '#E15571',
        forest: '#22B07D',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
        body: ['var(--font-body)'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(90deg, #0EC6E0, #E0399E)',
        'grid-pattern':
          'linear-gradient(rgba(19,23,32,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(19,23,32,0.035) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}
export default config
