'use client'

import { AppLayout } from '@/components/layout'
import AuthWrapper from '@/components/AuthWrapper'
import { redirect } from 'next/navigation'
import { isPowerApp } from '@/lib/app-mode'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  if (isPowerApp) redirect('/meters')

  return (
    <AuthWrapper>
      <AppLayout>
        {children}
      </AppLayout>
    </AuthWrapper>
  )
}