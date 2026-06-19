import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#080A0F',
        panel: '#11151D',
        soft: '#171C26',
        line: '#262C38',
        gold: '#E8A33D',
        crimson: '#E2493C',
        forest: '#3FA66E',
        steel: '#7C8AA0',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        mono: ['var(--font-mono)'],
        body: ['var(--font-body)'],
      },
      backgroundImage: {
        'grid-pattern':
          'linear-gradient(rgba(232,163,61,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(232,163,61,0.045) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}
export default config
