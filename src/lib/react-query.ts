import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale time: How long data is considered fresh (5 minutes)
      staleTime: 5 * 60 * 1000,
      // Cache time: How long inactive data stays in cache (30 minutes)
      gcTime: 30 * 60 * 1000,
      // Retry failed requests 3 times with exponential backoff
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors)
        if (error?.status >= 400 && error?.status < 500) {
          return false
        }
        return failureCount < 3
      },
      // Retry delay with exponential backoff
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Refetch on window focus for critical data
      refetchOnWindowFocus: true,
      // Background refetch interval for real-time data (2 minutes)
      refetchInterval: 2 * 60 * 1000,
      // Only refetch if data is stale
      refetchIntervalInBackground: false,
    },
    mutations: {
      // Retry mutations once on network errors
      retry: (failureCount, error: any) => {
        if (error?.status >= 400 && error?.status < 500) {
          return false
        }
        return failureCount < 1
      },
      // Network mode for offline support
      networkMode: 'online',
    },
  },
})

// Query key factory for consistent key management
export const queryKeys = {
  // Auth queries
  auth: {
    user: ['auth', 'user'] as const,
    session: ['auth', 'session'] as const,
  },
  
  // Device queries
  devices: {
    all: ['devices'] as const,
    list: (filters?: Record<string, any>) => ['devices', 'list', filters] as const,
    detail: (id: string) => ['devices', 'detail', id] as const,
    readings: (deviceId: string, limit?: number) => ['devices', deviceId, 'readings', limit] as const,
    latestReadings: ['devices', 'latest-readings'] as const,
    stats: (deviceId: string) => ['devices', deviceId, 'stats'] as const,
  },
  
  // User profile queries
  profile: {
    all: ['profile'] as const,
    info: ['profile', 'info'] as const,
    settings: ['profile', 'settings'] as const,
    notifications: ['profile', 'notifications'] as const,
    dataRetention: ['profile', 'data-retention'] as const,
    sessionSettings: ['profile', 'session-settings'] as const,
  },
  
  // System queries
  system: {
    collectionStatus: ['system', 'collection-status'] as const,
    backupStatus: ['system', 'backup-status'] as const,
    emailTest: ['system', 'email-test'] as const,
  },
  
  // Real-time data
  realtime: {
    deviceStatus: (deviceId: string) => ['realtime', 'device-status', deviceId] as const,
    collectionStats: ['realtime', 'collection-stats'] as const,
  },
} as const

// Helper to invalidate related queries
export const invalidateQueries = {
  devices: () => queryClient.invalidateQueries({ queryKey: queryKeys.devices.all }),
  deviceDetail: (deviceId: string) => queryClient.invalidateQueries({ queryKey: queryKeys.devices.detail(deviceId) }),
  profile: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile.all }),
  settings: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile.settings }),
}