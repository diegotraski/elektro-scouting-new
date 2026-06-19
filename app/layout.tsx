import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Elektro Scout', description: 'Clash of Clans esports scouting dashboard' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
