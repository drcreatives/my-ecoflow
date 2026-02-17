'use client'

import { Sidebar } from './Sidebar'
import { Header } from './Header'

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
}

export const AppLayout = ({ children, title }: AppLayoutProps) => {
  return (
    <div className="flex h-screen bg-bg-base">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <Header title={title} />
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-bg-base p-5">
          {children}
        </main>
      </div>
    </div>
  )
}