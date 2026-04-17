'use client'

import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useOnDemandRefresh } from '@/hooks/useOnDemandRefresh'

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
}

export const AppLayout = ({ children, title }: AppLayoutProps) => {
  const { refresh, isRefreshing } = useOnDemandRefresh()

  return (
    <div className="flex h-screen bg-bg-base">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <Header title={title} onRefresh={refresh} isRefreshing={isRefreshing} />
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-bg-base p-5">
          {children}
        </main>
      </div>
    </div>
  )
}