import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import { ServiceWorker } from '@/components/service-worker'

const dm = DM_Sans({ subsets: ['latin'], variable: '--font-dm', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'MarketLens · Price Intelligence', template: '%s · MarketLens' },
  description: 'Field price intelligence: capture shelf prices at every outlet and turn them into decisions.',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
  icons: { icon: '/brand/icon-192.png', apple: '/brand/apple-icon.png' },
  appleWebApp: { capable: true, title: 'MarketLens', statusBarStyle: 'default' },
}
export const viewport: Viewport = { themeColor: '#121212', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dm.variable}>
      <body className="min-h-dvh">{children}<ServiceWorker /></body>
    </html>
  )
}
