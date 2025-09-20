import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { Alert } from '@/types'

interface UIState {
  theme: 'dark'
  sidebarOpen: boolean
  notifications: Alert[]
  isOffline: boolean
}

interface UIActions {
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  addNotification: (notification: Alert) => void
  removeNotification: (id: string) => void
  markNotificationAsRead: (id: string) => void
  clearAllNotifications: () => void
  setOfflineStatus: (isOffline: boolean) => void
}

type UIStore = UIState & UIActions

export const useUIStore = create<UIStore>()(
  devtools(
    persist(
      (set, get) => ({
        // State
        theme: 'dark',
        sidebarOpen: true,
        notifications: [],
        isOffline: false,

        // Actions
        toggleSidebar: () => {
          const { sidebarOpen } = get()
          set({ sidebarOpen: !sidebarOpen })
        },

        setSidebarOpen: (open: boolean) => {
          set({ sidebarOpen: open })
        },

        addNotification: (notification: Alert) => {
          const { notifications } = get()
          const updatedNotifications = [notification, ...notifications].slice(0, 50) // Keep last 50 notifications
          set({ notifications: updatedNotifications })
        },

        removeNotification: (id: string) => {
          const { notifications } = get()
          const updatedNotifications = notifications.filter(n => n.id !== id)
          set({ notifications: updatedNotifications })
        },

        markNotificationAsRead: (id: string) => {
          const { notifications } = get()
          const updatedNotifications = notifications.map(notification =>
            notification.id === id
              ? { ...notification, isRead: true }
              : notification
          )
          set({ notifications: updatedNotifications })
        },

        clearAllNotifications: () => {
          set({ notifications: [] })
        },

        setOfflineStatus: (isOffline: boolean) => {
          set({ isOffline })
        },
      }),
      {
        name: 'ui-store',
        partialize: (state) => ({
          theme: state.theme,
          sidebarOpen: state.sidebarOpen,
        }),
      }
    ),
    {
      name: 'ui-store',
    }
  )
)

// Monitor online/offline status
if (typeof window !== 'undefined') {
  const updateOnlineStatus = () => {
    useUIStore.getState().setOfflineStatus(!navigator.onLine)
  }

  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
  
  // Set initial status
  updateOnlineStatus()
}