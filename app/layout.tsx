import './globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Oswald, JetBrains_Mono, Inter } from 'next/font/google'

const display = Oswald({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-display' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono' })
const body = Inter({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-body' })

export const metadata: Metadata = { title: 'Elektro Scout', description: 'Clash of Clans esports scouting dashboard' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  )
}
