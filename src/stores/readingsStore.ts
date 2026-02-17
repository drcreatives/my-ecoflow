import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { DeviceReading } from '@/lib/data-utils'

interface ReadingOptions {
  limit?: number
  offset?: number
  timeRange?: '1h' | '6h' | '24h' | '7d' | '30d'
  aggregation?: 'raw' | '5m' | '1h' | '1d'
  startDate?: Date
  endDate?: Date
  deviceId?: string
}

interface ReadingsState {
  readings: DeviceReading[]
  totalCount: number
  hasMore: boolean
  isLoading: boolean
  error: string | null
  lastUpdated: Date | null
  currentFilters: ReadingOptions | null
}

interface ReadingsActions {
  // Data fetching
  fetchReadings: (deviceId: string, options?: ReadingOptions) => Promise<void>
  loadMoreReadings: (deviceId: string) => Promise<void>
  refreshReadings: (deviceId: string) => Promise<void>
  
  // Data export
  exportReadings: (deviceId: string, format: 'json' | 'csv', options?: ReadingOptions) => Promise<void>
  
  // Utility actions
  clearReadings: () => void
  clearError: () => void
  setError: (error: string) => void
  setFilters: (filters: ReadingOptions) => void
  
  // Computed getters
  getReadingsByTimeRange: (timeRange: string) => DeviceReading[]
  getLatestReading: (deviceId: string) => DeviceReading | null
  getReadingsCount: () => number
}

type ReadingsStore = ReadingsState & ReadingsActions

const handleAPIError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}

const DEFAULT_LIMIT = 100

export const useReadingsStore = create<ReadingsStore>()(
  devtools(
    (set, get) => ({
      // State
      readings: [],
      totalCount: 0,
      hasMore: false,
      isLoading: false,
      error: null,
      lastUpdated: null,
      currentFilters: null,

      // Data fetching actions
      fetchReadings: async (deviceId: string, options: ReadingOptions = {}) => {
        console.log('[ReadingsStore] fetchReadings called:', { deviceId, options })
        
        try {
          set({ 
            isLoading: true, 
            error: null, 
            currentFilters: options 
          })
          
          const params = new URLSearchParams({
            deviceId,
            limit: (options.limit || DEFAULT_LIMIT).toString(),
            offset: (options.offset || 0).toString(),
          })

          if (options.timeRange) {
            params.append('timeRange', options.timeRange)
          }

          if (options.aggregation) {
            params.append('aggregation', options.aggregation)
          }
          
          if (options.startDate) {
            params.append('startDate', options.startDate.toISOString())
          }
          
          if (options.endDate) {
            params.append('endDate', options.endDate.toISOString())
          }
          
          const apiUrl = `/api/history/readings?${params.toString()}`
          console.log('[ReadingsStore] Making API request to:', apiUrl)
          
          const response = await fetch(apiUrl, {
            credentials: 'include', // Include cookies for authentication
            headers: {
              'Content-Type': 'application/json',
            }
          })
          
          console.log('[ReadingsStore] API response status:', response.status, response.statusText)
          
          if (!response.ok) {
            const errorText = await response.text()
            console.error('[ReadingsStore] API error response:', errorText)
            throw new Error(`API Error ${response.status}: ${response.statusText}`)
          }
          
          const data = await response.json()
          
          console.log('[ReadingsStore] API response data:', {
            success: data.success,
            dataStructure: Object.keys(data),
            readingsCount: data.data?.readings?.length || 0,
            total: data.data?.pagination?.total,
            hasMore: data.data?.pagination?.hasMore,
            firstReading: data.data?.readings?.[0]
          })
          
          // Extract readings from the nested data structure
          const readings = data.data?.readings || []
          const total = data.data?.pagination?.total || 0
          const hasMore = data.data?.pagination?.hasMore || false
          
          set({
            readings,
            totalCount: total,
            hasMore,
            isLoading: false,
            lastUpdated: new Date(),
          })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to fetch readings:', error)
        }
      },

      loadMoreReadings: async (deviceId: string) => {
        const { readings, currentFilters, hasMore, isLoading } = get()
        
        if (!hasMore || isLoading) {
          return
        }

        try {
          set({ isLoading: true, error: null })
          
          const options = {
            ...currentFilters,
            offset: readings.length,
            limit: currentFilters?.limit || DEFAULT_LIMIT,
          }
          
          const params = new URLSearchParams({
            deviceId,
            limit: options.limit.toString(),
            offset: options.offset.toString(),
          })

          if (options.timeRange) {
            params.append('timeRange', options.timeRange)
          }

          if (options.aggregation) {
            params.append('aggregation', options.aggregation)
          }
          
          if (options.startDate) {
            params.append('startDate', options.startDate.toISOString())
          }
          
          if (options.endDate) {
            params.append('endDate', options.endDate.toISOString())
          }
          
          const response = await fetch(`/api/history/readings?${params.toString()}`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            }
          })
          
          if (!response.ok) {
            throw new Error('Failed to load more readings')
          }
          
          const data = await response.json()
          
          // Extract readings from the nested data structure
          const newReadings = data.data?.readings || []
          const total = data.data?.pagination?.total || 0
          const hasMore = data.data?.pagination?.hasMore || false
          
          set({
            readings: [...readings, ...newReadings],
            totalCount: total,
            hasMore,
            isLoading: false,
            lastUpdated: new Date(),
          })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to load more readings:', error)
        }
      },

      refreshReadings: async (deviceId: string) => {
        const { currentFilters } = get()
        await get().fetchReadings(deviceId, { ...currentFilters, offset: 0 })
      },

      // Data export action
      exportReadings: async (deviceId: string, format: 'json' | 'csv', options: ReadingOptions = {}) => {
        try {
          set({ isLoading: true, error: null })
          
          const params = new URLSearchParams({
            deviceId,
            format,
            export: 'true',
          })

          if (options.timeRange) {
            params.append('timeRange', options.timeRange)
          }

          if (options.aggregation) {
            params.append('aggregation', options.aggregation)
          }
          
          if (options.startDate) {
            params.append('startDate', options.startDate.toISOString())
          }
          
          if (options.endDate) {
            params.append('endDate', options.endDate.toISOString())
          }
          
          const response = await fetch(`/api/history/readings?${params.toString()}`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            }
          })
          
          if (!response.ok) {
            throw new Error('Failed to export readings')
          }

          // Handle file download
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `device-${deviceId}-readings.${format}`
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
          console.error('Failed to export readings:', error)
          throw error
        }
      },

      // Utility actions
      clearReadings: () => {
        set({ 
          readings: [], 
          totalCount: 0, 
          hasMore: false, 
          currentFilters: null 
        })
      },

      clearError: () => {
        set({ error: null })
      },

      setError: (error: string) => {
        set({ error })
      },

      setFilters: (filters: ReadingOptions) => {
        set({ currentFilters: filters })
      },

      // Computed getters
      getReadingsByTimeRange: (timeRange: string) => {
        const { readings } = get()
        const now = new Date()
        let cutoffDate: Date

        switch (timeRange) {
          case '1h':
            cutoffDate = new Date(now.getTime() - 60 * 60 * 1000)
            break
          case '6h':
            cutoffDate = new Date(now.getTime() - 6 * 60 * 60 * 1000)
            break
          case '24h':
            cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            break
          case '7d':
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
          case '30d':
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            break
          default:
            return readings
        }

        return readings.filter(reading => 
          new Date(reading.recordedAt) >= cutoffDate
        )
      },

      getLatestReading: (deviceId: string) => {
        const { readings } = get()
        const deviceReadings = readings.filter(r => r.deviceId === deviceId)
        
        if (deviceReadings.length === 0) {
          return null
        }

        return deviceReadings.reduce((latest, current) => 
          new Date(current.recordedAt) > new Date(latest.recordedAt) ? current : latest
        )
      },

      getReadingsCount: () => {
        return get().totalCount
      },
    }),
    {
      name: 'readings-store',
    }
  )
)