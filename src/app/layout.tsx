import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/providers/Providers'
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
  viewport: 'width=device-width, initial-scale=1',
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
        className={`${inter.variable} font-sans antialiased`}
        suppressHydrationWarning={true}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
