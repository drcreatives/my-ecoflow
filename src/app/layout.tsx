import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'EcoFlow Dashboard',
  description: 'Monitor and manage your EcoFlow Delta 2 power station',
  keywords: ['EcoFlow', 'Delta 2', 'Power Station', 'Battery Monitor', 'Energy Management'],
  authors: [{ name: 'EcoFlow Dashboard' }],
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover'
  },
  themeColor: '#44af21',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body 
        className={`${inter.variable} font-sans antialiased bg-primary-black text-accent-gray min-h-screen`}
        suppressHydrationWarning={true}
      >
        {children}
      </body>
    </html>
  )
}
