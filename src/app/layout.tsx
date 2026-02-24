import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Toaster } from 'sonner'
import { ConvexClientProvider } from '@/components/ConvexClientProvider'
import './globals.css'

const neueMontreal = localFont({
  src: [
    { path: '../../public/fonts/NeueMontreal-Light.otf', weight: '300', style: 'normal' },
    { path: '../../public/fonts/NeueMontreal-LightItalic.otf', weight: '300', style: 'italic' },
    { path: '../../public/fonts/NeueMontreal-Regular.otf', weight: '400', style: 'normal' },
    { path: '../../public/fonts/NeueMontreal-Italic.otf', weight: '400', style: 'italic' },
    { path: '../../public/fonts/NeueMontreal-Medium.otf', weight: '500', style: 'normal' },
    { path: '../../public/fonts/NeueMontreal-MediumItalic.otf', weight: '500', style: 'italic' },
    { path: '../../public/fonts/NeueMontreal-Bold.otf', weight: '700', style: 'normal' },
    { path: '../../public/fonts/NeueMontreal-BoldItalic.otf', weight: '700', style: 'italic' },
  ],
  variable: '--font-neue-montreal',
  display: 'swap',
  fallback: ['Inter', 'SF Pro Text', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'],
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
        className={`${neueMontreal.variable} font-sans antialiased bg-bg-base text-text-primary min-h-screen`}
        suppressHydrationWarning={true}
      >
        <ConvexClientProvider>
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
                background: '#1f201f',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.92)',
                borderRadius: '18px',
              },
              className: 'sonner-toast',
            }}
          />
        </ConvexClientProvider>
      </body>
    </html>
  )
}
