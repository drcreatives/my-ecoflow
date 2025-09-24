'use client'

import { AppLayout } from '@/components/layout'
import AuthWrapper from '@/components/AuthWrapper'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <AuthWrapper>
      <AppLayout>
        {children}
      </AppLayout>
    </AuthWrapper>
  )
}