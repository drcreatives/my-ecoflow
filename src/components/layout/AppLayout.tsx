'use client'

import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { useUIStore } from '@/stores/uiStore'

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
}

export const AppLayout = ({ children, title }: AppLayoutProps) => {
  const { sidebarOpen } = useUIStore()

  return (
    <div className="flex h-screen bg-primary-black">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <Header title={title} />
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-primary-black p-6">
          {children}
        </main>
      </div>
    </div>
  )
}