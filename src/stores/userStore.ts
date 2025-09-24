import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface UserProfile {
  id: string
  email: string
  firstName?: string
  lastName?: string
  timezone?: string
  createdAt: Date
  updatedAt: Date
}

interface NotificationSettings {
  emailNotifications: boolean
  pushNotifications: boolean
  smsNotifications: boolean
  deviceAlerts: boolean
  systemUpdates: boolean
  weeklyReports: boolean
}

interface DataRetentionSettings {
  retentionPeriod: '30d' | '90d' | '1y' | 'forever'
  autoCleanup: boolean
}

interface UserState {
  profile: UserProfile | null
  notifications: NotificationSettings | null
  dataRetention: DataRetentionSettings | null
  isLoading: boolean
  error: string | null
}

interface UserActions {
  // Profile management
  fetchProfile: () => Promise<void>
  updateProfile: (profile: Partial<UserProfile>) => Promise<void>
  
  // Notification settings
  fetchNotificationSettings: () => Promise<void>
  updateNotificationSettings: (settings: NotificationSettings) => Promise<void>
  
  // Data retention
  fetchDataRetentionSettings: () => Promise<void>
  updateDataRetentionSettings: (settings: DataRetentionSettings) => Promise<void>
  
  // Account management
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  testEmailSettings: () => Promise<void>
  exportData: (format: 'json' | 'csv') => Promise<void>
  
  // Utility actions
  clearError: () => void
  setError: (error: string) => void
}

type UserStore = UserState & UserActions

const handleAPIError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}

export const useUserStore = create<UserStore>()(
  devtools(
    (set, get) => ({
      // State
      profile: null,
      notifications: null,
      dataRetention: null,
      isLoading: false,
      error: null,

      // Profile management actions
      fetchProfile: async () => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch('/api/user/profile')
          
          if (!response.ok) {
            throw new Error('Failed to fetch profile')
          }
          
          const data = await response.json()
          
          console.log('[UserStore] Raw API response:', data)
          
          // Extract profile from nested structure if needed
          const profile = data.profile || data
          
          console.log('[UserStore] Extracted profile:', profile)
          
          set({
            profile,
            isLoading: false,
          })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to fetch profile:', error)
        }
      },

      updateProfile: async (profileData: Partial<UserProfile>) => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch('/api/user/profile', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(profileData),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to update profile')
          }

          const updatedProfile = await response.json()
          
          set({
            profile: { ...get().profile, ...updatedProfile },
            isLoading: false,
          })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to update profile:', error)
          throw error
        }
      },

      // Notification settings actions
      fetchNotificationSettings: async () => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch('/api/user/notifications')
          
          if (!response.ok) {
            throw new Error('Failed to fetch notification settings')
          }
          
          const notifications = await response.json()
          
          set({
            notifications,
            isLoading: false,
          })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to fetch notification settings:', error)
        }
      },

      updateNotificationSettings: async (settings: NotificationSettings) => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch('/api/user/notifications', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to update notification settings')
          }

          const updatedSettings = await response.json()
          
          set({
            notifications: updatedSettings,
            isLoading: false,
          })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to update notification settings:', error)
          throw error
        }
      },

      // Data retention actions
      fetchDataRetentionSettings: async () => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch('/api/user/data-retention')
          
          if (!response.ok) {
            throw new Error('Failed to fetch data retention settings')
          }
          
          const dataRetention = await response.json()
          
          set({
            dataRetention,
            isLoading: false,
          })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to fetch data retention settings:', error)
        }
      },

      updateDataRetentionSettings: async (settings: DataRetentionSettings) => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch('/api/user/data-retention', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(settings),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to update data retention settings')
          }

          const updatedSettings = await response.json()
          
          set({
            dataRetention: updatedSettings,
            isLoading: false,
          })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to update data retention settings:', error)
          throw error
        }
      },

      // Account management actions
      changePassword: async (oldPassword: string, newPassword: string) => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch('/api/user/change-password', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ oldPassword, newPassword }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to change password')
          }
          
          set({ isLoading: false })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to change password:', error)
          throw error
        }
      },

      testEmailSettings: async () => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch('/api/email/test', {
            method: 'POST',
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to test email settings')
          }
          
          set({ isLoading: false })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to test email settings:', error)
          throw error
        }
      },

      exportData: async (format: 'json' | 'csv') => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetch(`/api/user/backup?format=${format}`, {
            method: 'GET',
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Failed to export data')
          }

          // Handle file download
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `ecoflow-data-export.${format}`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
          
          set({ isLoading: false })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to export data:', error)
          throw error
        }
      },

      // Utility actions
      clearError: () => {
        set({ error: null })
      },

      setError: (error: string) => {
        set({ error })
      },
    }),
    {
      name: 'user-store',
    }
  )
)