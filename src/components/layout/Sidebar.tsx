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
    <div className="h-full bg-primary-dark border-r border-gray-700 w-full flex flex-col">
      {/* Navigation */}
      <nav className="flex-1 mt-4 px-3 space-y-1 overflow-y-auto">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link key={item.href} href={item.href} onClick={onClose}>
              <button
                className={cn(
                  'w-full flex items-start gap-3 p-4 rounded-md text-left transition-colors touch-manipulation',
                  'min-h-[60px]', // Better touch target size
                  isActive 
                    ? 'bg-accent-green text-white' 
                    : 'text-accent-gray hover:bg-gray-700 active:bg-gray-600'
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
      <div className="p-4 border-t border-gray-700">
        {user && (
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "bg-accent-green rounded-full flex items-center justify-center font-bold text-white",
              isMobile ? "w-10 h-10 text-base" : "w-8 h-8 text-sm"
            )}>
              {user.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className={cn(
                "font-medium text-accent-gray truncate",
                isMobile ? "text-base" : "text-sm"
              )}>
                {user.email}
              </div>
              <div className={cn(
                "text-gray-400",
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
            'w-full flex items-center gap-3 text-gray-400 hover:text-accent-gray hover:bg-gray-700 active:bg-gray-600 rounded-md transition-colors touch-manipulation',
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
            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            onClick={toggleSidebar}
          />
        )}
        
        {/* Mobile Sidebar */}
        <div
          className={cn(
            "fixed top-0 left-0 h-full w-80 bg-primary-dark z-50 transition-transform duration-300 ease-out",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Mobile Header */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent-green rounded-md flex items-center justify-center">
                <Zap size={20} className="text-white" />
              </div>
              <span className="text-lg font-bold text-accent-gray">
                EcoFlow
              </span>
            </div>
            <button
              onClick={toggleSidebar}
              className="p-2 text-accent-gray hover:bg-gray-700 rounded-md transition-colors touch-manipulation"
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
        sidebarOpen ? "w-70" : "w-20"
      )}
    >
      {sidebarOpen ? (
        <SidebarContent />
      ) : (
        <div className="w-20 h-full bg-primary-dark border-r border-gray-700">
          <div className="flex flex-col items-center gap-4 pt-4">
            <button
              onClick={toggleSidebar}
              className="p-2 text-accent-gray hover:text-white transition-colors"
            >
              <Menu size={20} />
            </button>
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={cn(
                      'p-2 rounded-md transition-colors',
                      isActive 
                        ? 'bg-accent-green text-white' 
                        : 'text-accent-gray hover:bg-gray-700'
                    )}
                  >
                    <Icon size={20} />
                  </button>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}