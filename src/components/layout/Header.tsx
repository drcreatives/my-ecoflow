'use client'

import {
  Bell,
  Menu,
  Wifi,
  WifiOff,
  Settings,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useDeviceStore } from '@/stores/deviceStore'
import { useIsMobile } from '@/hooks/useBreakpoint'
import LogoutButton from '@/components/LogoutButton'
import { cn } from '@/lib/utils'

interface HeaderProps {
  title?: string
}

export const Header = ({ title }: HeaderProps) => {
  const { user } = useAuthStore()
  const { notifications, toggleSidebar } = useUIStore()
  const { devices } = useDeviceStore()
  const isMobile = useIsMobile()

  const unreadNotifications = notifications.filter(n => !n.isRead).length
  const activeDevices = devices.filter(d => d.isActive).length
  const totalDevices = devices.length

  // Mock connection status for now
  const isOnline = true

  return (
    <header className="bg-primary-dark border-b border-gray-700 px-4 sm:px-6 py-4 sticky top-0 z-50">
      <div className="flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center gap-2 sm:gap-4">
          {isMobile && (
            <button
              onClick={toggleSidebar}
              className="p-2 text-accent-gray hover:bg-gray-700 rounded-md transition-colors touch-manipulation"
              aria-label="Toggle navigation menu"
            >
              <Menu size={20} />
            </button>
          )}
          
          <div className="flex flex-col gap-1">
            <h1 className="text-lg sm:text-xl font-bold text-accent-gray">
              {title || 'Dashboard'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">
              Welcome back, {user?.email?.split('@')[0]}
            </p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Device Status - Hidden on mobile */}
          {!isMobile && (
            <div className="flex items-center gap-2">
              <div 
                className={cn(
                  "w-2 h-2 rounded-full",
                  isOnline ? "bg-accent-green" : "bg-red-400"
                )}
              />
              <span className="text-sm text-accent-gray">
                {activeDevices}/{totalDevices} devices active
              </span>
            </div>
          )}

          {/* Connection Status - Simplified on mobile */}
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi size={isMobile ? 18 : 16} className="text-accent-green" />
            ) : (
              <WifiOff size={isMobile ? 18 : 16} className="text-red-400" />
            )}
            {!isMobile && (
              <span className={cn(
                "text-sm",
                isOnline ? "text-accent-green" : "text-red-400"
              )}>
                {isOnline ? 'Connected' : 'Offline'}
              </span>
            )}
          </div>

          {/* Notifications */}
          <button 
            className="relative p-2 text-accent-gray hover:bg-gray-700 rounded-md transition-colors touch-manipulation"
            aria-label={`Notifications ${unreadNotifications > 0 ? `(${unreadNotifications} unread)` : ''}`}
          >
            <Bell size={isMobile ? 18 : 20} />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent-green text-white text-xs rounded-full min-w-5 h-5 flex items-center justify-center">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>

          {/* Settings - Hidden on mobile */}
          {!isMobile && (
            <button 
              className="p-2 text-accent-gray hover:bg-gray-700 rounded-md transition-colors"
              aria-label="Settings"
            >
              <Settings size={20} />
            </button>
          )}

          {/* Logout Button */}
          <LogoutButton isMobile={isMobile} />
        </div>
      </div>
    </header>
  )
}