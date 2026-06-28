import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F4F6FA',
        panel: '#FFFFFF',
        soft: '#F0F2F7',
        line: '#E2E6ED',
        ink: '#131720',
        steel: '#6B7488',
        cyan: '#0EC6E0',
        magenta: '#E0399E',
        ground: '#B8862E',
        air: '#3B8FD6',
        success: '#1A9C6B',
        danger: '#D8425C',
        // legacy aliases kept so existing utility classes (bg-gold, text-crimson, etc.) still resolve
        gold: '#B8862E',
        crimson: '#D8425C',
        forest: '#1A9C6B',
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
