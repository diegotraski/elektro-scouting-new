import './globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Space_Grotesk, JetBrains_Mono, Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

const display = Space_Grotesk({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' })

export const metadata: Metadata = { title: 'Team Elektros Scout', description: 'Clash of Clans competitive scouting platform' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
