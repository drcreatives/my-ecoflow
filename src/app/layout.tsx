import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'sonner'
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
    <html lang="en" className="dark" suppressHydrationWarning={true}>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body 
        className={`${inter.variable} font-sans antialiased bg-primary-black text-accent-gray min-h-screen`}
        suppressHydrationWarning={true}
      >
        {children}
        <Toaster 
          theme="dark"
          position="top-right"
          richColors
          closeButton
          expand={false}
          visibleToasts={4}
          toastOptions={{
            style: {
              background: '#2b2b2b',
              border: '1px solid #374151',
              color: '#ebebeb',
            },
            className: 'sonner-toast',
          }}
        />
      </body>
    </html>
  )
}
