"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Menu, Wifi, WifiOff, Settings } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useUIStore } from "@/stores/uiStore";
import { useDevices } from "@/hooks/useDevices";
import { useProfile } from "@/hooks/useProfile";
import { useIsMobile } from "@/hooks/useBreakpoint";
import LogoutButton from "@/components/LogoutButton";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title?: string;
}

export const Header = ({ title }: HeaderProps) => {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: profile } = useProfile();
  const {
    notifications,
    toggleSidebar,
    markNotificationAsRead,
    removeNotification,
  } = useUIStore();
  const { data: devices = [] } = useDevices();
  const isMobile = useIsMobile();
  const [showNotifications, setShowNotifications] = useState(false);

  const unreadNotifications = notifications.filter((n) => !n.isRead).length;
  // Fix device counting to match dashboard logic - use the same criteria
  const activeDevices = devices.filter(
    (d: any) => d.online === true || d.online === 1
  ).length;
  const totalDevices = devices.length;

  // Generate proper greeting
  const getGreeting = () => {
    if (profile?.firstName && profile?.lastName) {
      return `Welcome back, ${profile.firstName} ${profile.lastName}`;
    } else if (profile?.firstName) {
      return `Welcome back, ${profile.firstName}`;
    } else if (user?.email) {
      return `Welcome back, ${user.email.split("@")[0]}`;
    }
    return "Welcome back";
  };

  // Mock connection status for now
  const isOnline = true;

  return (
    <header className="bg-primary-dark border-b border-gray-700 px-4 sm:px-6 py-4 sticky top-0 z-50">
      <div className="flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={toggleSidebar}
            className="p-2 text-accent-gray hover:bg-gray-700 rounded-md transition-colors touch-manipulation"
            aria-label="Toggle navigation menu"
          >
            <Menu size={20} />
          </button>

          <div className="flex flex-col gap-1">
            <h1 className="text-lg sm:text-xl font-bold text-accent-gray">
              {title || "Dashboard"}
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 hidden sm:block">
              {getGreeting()}
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
              <span
                className={cn(
                  "text-sm",
                  isOnline ? "text-accent-green" : "text-red-400"
                )}
              >
                {isOnline ? "Connected" : "Offline"}
              </span>
            )}
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 text-accent-gray hover:bg-gray-700 rounded-md transition-colors touch-manipulation"
              aria-label={`Notifications ${unreadNotifications > 0 ? `(${unreadNotifications} unread)` : ""}`}
            >
              <Bell size={isMobile ? 18 : 20} />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-accent-green text-white text-xs rounded-full min-w-5 h-5 flex items-center justify-center">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </button>

            {/* Notifications Dropdown */}
            {showNotifications && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowNotifications(false)}
                />
                {/* Dropdown Panel */}
                <div className="absolute top-full right-0 mt-2 w-80 bg-primary-dark/95 backdrop-blur-[5px] border border-gray-700 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
                  <div className="p-4 border-b border-gray-700">
                    <h3 className="text-lg font-semibold text-white">
                      Notifications
                    </h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length > 0 ? (
                      notifications.slice(0, 10).map((notification) => (
                        <div
                          key={notification.id}
                          className={cn(
                            "p-4 border-b border-gray-700 hover:bg-gray-800 transition-colors cursor-pointer",
                            !notification.isRead && "bg-accent-green/5"
                          )}
                          onClick={() => {
                            if (!notification.isRead) {
                              markNotificationAsRead(notification.id);
                            }
                          }}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-white">
                                {notification.title}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {notification.message}
                              </p>
                              <p className="text-xs text-gray-500 mt-2">
                                {new Date(
                                  notification.createdAt
                                ).toLocaleDateString()}{" "}
                                at{" "}
                                {new Date(
                                  notification.createdAt
                                ).toLocaleTimeString()}
                              </p>
                            </div>
                            {!notification.isRead && (
                              <div className="w-2 h-2 bg-accent-green rounded-full ml-2 mt-1 flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <Bell
                          size={32}
                          className="text-gray-600 mx-auto mb-2"
                        />
                        <p className="text-gray-400">No notifications yet</p>
                      </div>
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <div className="p-4 border-t border-gray-700">
                      <button
                        onClick={() => {
                          notifications.forEach((n) => {
                            if (!n.isRead) markNotificationAsRead(n.id);
                          });
                          setShowNotifications(false);
                        }}
                        className="w-full text-center text-accent-green hover:text-accent-green/80 text-sm font-medium transition-colors"
                      >
                        Mark all as read
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Settings - Hidden on mobile */}
          {!isMobile && (
            <button
              onClick={() => router.push("/settings")}
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
  );
};
