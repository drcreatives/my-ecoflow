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
import Link from 'next/link'

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
    <header className="h-14 bg-surface-1 border-b border-stroke-subtle px-4 sm:px-6 flex items-center sticky top-0 z-50">
      <div className="flex items-center justify-between w-full">
        {/* Left side */}
        <div className="flex items-center gap-2 sm:gap-4">
          {isMobile && (
            <button
              onClick={toggleSidebar}
              className="p-2 text-icon hover:text-text-primary hover:bg-surface-2 rounded-inner transition-all duration-160 touch-manipulation"
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>
          )}
          <div className="flex flex-col gap-0.5">
            <h1 className="text-base sm:text-lg font-medium text-text-primary">
              {title || 'Dashboard'}
            </h1>
            <p className="text-xs text-text-secondary hidden sm:block">
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
                  isOnline ? "bg-brand-primary" : "bg-danger"
                )}
              />
              <span className="text-sm text-text-secondary">
                {activeDevices}/{totalDevices} devices active
              </span>
            </div>
          )}

          {/* Connection Status - Simplified on mobile */}
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi size={16} className="text-icon" />
            ) : (
              <WifiOff size={16} className="text-icon" />
            )}
            {!isMobile && (
              <span className={cn(
                "text-sm",
                isOnline ? "text-brand-primary" : "text-danger"
              )}>
                {isOnline ? 'Connected' : 'Offline'}
              </span>
            )}
          </div>

          {/* Notifications */}
          <button 
            className="relative p-2 text-icon hover:text-text-primary hover:bg-surface-2 rounded-inner transition-all duration-160 touch-manipulation"
            aria-label={`Notifications ${unreadNotifications > 0 ? `(${unreadNotifications} unread)` : ''}`}
          >
            <Bell size={16} />
            {unreadNotifications > 0 && (
              <span className="absolute -top-1 -right-1 bg-brand-primary text-bg-base text-xs rounded-full min-w-5 h-5 flex items-center justify-center">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>

          {/* Settings - Hidden on mobile */}
          {!isMobile && (
            <Link
              href="/settings"
              className="p-2 text-icon hover:text-text-primary hover:bg-surface-2 rounded-inner transition-all duration-160"
              aria-label="Settings"
            >
              <Settings size={16} />
            </Link>
          )}

          {/* Logout Button */}
          <LogoutButton isMobile={isMobile} />
        </div>
      </div>
    </header>
  )
}