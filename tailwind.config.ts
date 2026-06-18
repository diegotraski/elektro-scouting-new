import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#070A12',
        panel: '#0D1324',
        soft: '#121A31',
        line: '#26324D',
        accent: '#4F8CFF'
      }
    },
  },
  plugins: [],
}
export default config
