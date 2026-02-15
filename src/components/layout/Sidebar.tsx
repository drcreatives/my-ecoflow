'use client'

import {
  Home,
  Battery,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Zap,
  TrendingUp,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useIsMobile } from '@/hooks/useBreakpoint'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onClose?: () => void
}

const navigationItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    description: 'Overview of all devices'
  },
  {
    label: 'Devices',
    href: '/devices',
    icon: Battery,
    description: 'Manage your power stations'
  },
  {
    label: 'Analytics',
    href: '/analytics',
    icon: BarChart3,
    description: 'Energy usage insights'
  },
  {
    label: 'History',
    href: '/history',
    icon: TrendingUp,
    description: 'Historical data'
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'App preferences'
  },
]

const SidebarContent = ({ onClose }: SidebarProps) => {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const isMobile = useIsMobile()
  
  const handleLogout = async () => {
    try {
      await logout()
      onClose?.()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Navigation */}
      <nav className="flex-1 mt-4 px-3 space-y-1 overflow-y-auto">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link key={item.href} href={item.href} onClick={onClose}>
              <button
                className={cn(
                  'w-full flex items-start gap-3 p-4 rounded-inner text-left transition-all duration-160 ease-dashboard touch-manipulation',
                  'min-h-[60px]',
                  isActive 
                    ? 'bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary' 
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-2 active:bg-surface-2'
                )}
              >
                <Icon size={isMobile ? 22 : 20} className="flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    "font-medium",
                    isMobile ? "text-base" : "text-sm"
                  )}>
                    {item.label}
                  </div>
                  <div className={cn(
                    "opacity-70",
                    isMobile ? "text-sm" : "text-xs"
                  )}>
                    {item.description}
                  </div>
                </div>
              </button>
            </Link>
          )
        })}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-4 border-t border-stroke-subtle">
        {user && (
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "bg-surface-2 border border-stroke-subtle rounded-full flex items-center justify-center font-bold text-text-primary",
              isMobile ? "w-10 h-10 text-base" : "w-8 h-8 text-sm"
            )}>
              {user.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "font-medium text-text-primary truncate",
                isMobile ? "text-base" : "text-sm"
              )}>
                {user.email}
              </div>
              <div className={cn(
                "text-text-muted",
                isMobile ? "text-sm" : "text-xs"
              )}>
                Online
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-3 text-danger/70 hover:text-danger hover:bg-danger/10 rounded-inner transition-all duration-160 touch-manipulation',
            isMobile ? 'p-4 text-base' : 'p-2'
          )}
        >
          <LogOut size={isMobile ? 22 : 20} />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  )
}

// Collapsed sidebar content component for desktop
const CollapsedSidebar = () => {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const { toggleSidebar } = useUIStore()
  
  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <div className="w-20 h-full bg-surface-1 border-r border-stroke-subtle flex flex-col">
      {/* Logo and toggle */}
      <div className="flex flex-col items-center gap-4 pt-4 pb-4 border-b border-stroke-subtle">
        <div className="w-8 h-8 bg-surface-2 rounded-inner flex items-center justify-center text-brand-primary">
          <Zap size={20} />
        </div>
        <button
          onClick={toggleSidebar}
          className="p-2 text-icon hover:text-text-primary transition-all duration-160"
          title="Expand sidebar"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Navigation icons */}
      <nav className="flex-1 flex flex-col items-center gap-2 pt-4">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          
          return (
            <Link key={item.href} href={item.href} title={item.label}>
              <button
                className={cn(
                  'p-3 rounded-inner transition-all duration-160 w-12 h-12 flex items-center justify-center',
                  isActive 
                    ? 'bg-brand-primary/10 text-brand-primary' 
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                )}
              >
                <Icon size={20} />
              </button>
            </Link>
          )
        })}
      </nav>

      {/* User profile collapsed */}
      <div className="p-4 border-t border-stroke-subtle flex flex-col items-center gap-2">
        {user && (
          <div className="w-8 h-8 bg-surface-2 border border-stroke-subtle rounded-full flex items-center justify-center font-bold text-text-primary text-sm" title={user.email}>
            {user.email?.[0]?.toUpperCase()}
          </div>
        )}
        <button
          onClick={handleLogout}
          className="p-2 text-danger/70 hover:text-danger hover:bg-danger/10 rounded-inner transition-all duration-160"
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  )
}

export const Sidebar = () => {
  const pathname = usePathname()
  const { sidebarOpen, toggleSidebar } = useUIStore()
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <>
        {/* Mobile Sidebar Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
            onClick={toggleSidebar}
          />
        )}
        
        {/* Mobile Sidebar */}
        <div
          className={cn(
            "fixed top-0 left-0 h-full w-80 bg-surface-1 z-50 transition-transform duration-300 ease-dashboard",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Mobile Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-stroke-subtle">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-surface-2 rounded-inner flex items-center justify-center text-brand-primary">
                <Zap size={20} />
              </div>
              <span className="text-lg font-bold text-text-primary">
                EcoFlow
              </span>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-2 text-icon hover:bg-surface-2 rounded-inner transition-all duration-160 touch-manipulation"
              aria-label="Close navigation menu"
            >
              <Menu size={20} />
            </button>
          </div>
          
          <SidebarContent onClose={toggleSidebar} />
        </div>
      </>
    )
  }

  return (
    <div
      className={cn(
        "transition-all duration-300 ease-in-out relative",
        sidebarOpen ? "w-80" : "w-20"
      )}
    >
      {sidebarOpen ? (
        <div className="w-80 h-full bg-surface-1 border-r border-stroke-subtle flex flex-col">
          {/* Desktop Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-stroke-subtle">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-surface-2 rounded-inner flex items-center justify-center text-brand-primary">
                <Zap size={20} />
              </div>
              <span className="text-lg font-bold text-text-primary">
                EcoFlow
              </span>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-2 text-icon hover:bg-surface-2 rounded-inner transition-all duration-160"
              aria-label="Collapse navigation menu"
              title="Collapse sidebar"
            >
              <Menu size={20} />
            </button>
          </div>
          
          <SidebarContent />
        </div>
      ) : (
        <CollapsedSidebar />
      )}
    </div>
  )
}