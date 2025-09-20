'use client'

import {
  Home,
  Battery,
  BarChart3,
  Settings,
  Power,
  LogOut,
  Menu,
  Zap,
  TrendingUp,
  Bell,
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
  
  const handleLogout = async () => {
    try {
      await logout()
      onClose?.()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  return (
    <div className="h-full bg-primary-dark border-r border-gray-700 w-70 flex flex-col">
      {/* Header */}
      <div className="h-16 flex items-center mx-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-accent-green rounded-md flex items-center justify-center">
            <Zap size={20} className="text-white" />
          </div>
          <span className="text-lg font-bold text-accent-gray">
            EcoFlow
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gray-700 mx-4" />

      {/* Navigation */}
      <nav className="flex-1 mt-4 px-3 space-y-1">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon

          return (
            <Link key={item.href} href={item.href} onClick={onClose}>
              <button
                className={cn(
                  'w-full flex items-start gap-3 p-3 rounded-md text-left transition-colors h-12',
                  isActive 
                    ? 'bg-accent-green text-white' 
                    : 'text-accent-gray hover:bg-gray-700'
                )}
              >
                <Icon size={20} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs opacity-70">{item.description}</div>
                </div>
              </button>
            </Link>
          )
        })}
      </nav>

      {/* User Profile & Logout */}
      <div className="p-4 border-t border-gray-700">
        {user && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-accent-green rounded-full flex items-center justify-center text-sm font-bold text-white">
              {user.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-accent-gray truncate">
                {user.email}
              </div>
              <div className="text-xs text-gray-400">
                Online
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 p-2 text-gray-400 hover:text-accent-gray hover:bg-gray-700 rounded-md transition-colors"
        >
          <LogOut size={20} />
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
      <div>
        <button
          onClick={toggleSidebar}
          className="fixed top-4 left-4 z-50 bg-primary-dark border border-gray-700 text-accent-gray hover:text-white p-2 rounded-md flex items-center gap-2 transition-colors"
        >
          <Menu size={20} />
          <span>Menu</span>
        </button>
        
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={toggleSidebar}
          >
            <div
              className="w-70 h-full bg-primary-dark"
              onClick={(e) => e.stopPropagation()}
            >
              <SidebarContent onClose={toggleSidebar} />
            </div>
          </div>
        )}
      </div>
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