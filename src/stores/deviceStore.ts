import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { 
  DeviceData, 
  DeviceReading, 
  fetchDevices, 
  fetchDeviceDetails, 
  fetchDeviceReadings,
  controlDevice,
  handleAPIError 
} from '@/lib/data-utils'

interface DeviceState {
  devices: DeviceData[]
  currentDevice: DeviceData | null
  readings: DeviceReading[]
  isLoading: boolean
  isControlling: boolean
  error: string | null
  lastUpdated: Date | null
}

interface DeviceActions {
  // Device management
  fetchDevices: () => Promise<void>
  refreshDevice: (deviceId: string) => Promise<void>
  selectDevice: (deviceId: string) => void
  clearCurrentDevice: () => void
  
  // Readings management
  fetchReadings: (deviceId: string, options?: {
    limit?: number
    offset?: number
    timeRange?: '1h' | '6h' | '24h' | '7d' | '30d'
  }) => Promise<void>
  
  // Device control
  controlDevice: (deviceId: string, command: {
    cmdSet: number
    cmdId: number
    param: any
  }) => Promise<boolean>
  
  // Utility actions
  clearError: () => void
  setError: (error: string) => void
  
  // Computed getters
  getDeviceById: (id: string) => DeviceData | undefined
  getOnlineDevices: () => DeviceData[]
  getActiveDevices: () => DeviceData[]
}

type DeviceStore = DeviceState & DeviceActions

export const useDeviceStore = create<DeviceStore>()(
  devtools(
    (set, get) => ({
      // State
      devices: [],
      currentDevice: null,
      readings: [],
      isLoading: false,
      isControlling: false,
      error: null,
      lastUpdated: null,

      // Device management actions
      fetchDevices: async () => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetchDevices()
          
          set({
            devices: response.devices,
            isLoading: false,
            lastUpdated: new Date(),
          })
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to fetch devices:', error)
        }
      },

      refreshDevice: async (deviceId: string) => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetchDeviceDetails(deviceId)
          const { devices } = get()
          
          // Update the device in the devices array
          const updatedDevices = devices.map(device => 
            device.id === deviceId ? response.device : device
          )
          
          set({
            devices: updatedDevices,
            currentDevice: get().currentDevice?.id === deviceId 
              ? response.device 
              : get().currentDevice,
            isLoading: false,
            lastUpdated: new Date(),
          })
          
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isLoading: false,
          })
          console.error('Failed to refresh device:', error)
        }
      },

      selectDevice: (deviceId: string) => {
        const device = get().getDeviceById(deviceId)
        set({ currentDevice: device || null })
      },

      clearCurrentDevice: () => {
        set({ currentDevice: null, readings: [] })
      },

      // Readings management
      fetchReadings: async (deviceId: string, options = {}) => {
        try {
          set({ isLoading: true, error: null })
          
          const response = await fetchDeviceReadings(deviceId, options)
          
          set({
            readings: response.readings,
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

      // Device control
      controlDevice: async (deviceId: string, command) => {
        try {
          set({ isControlling: true, error: null })
          
          const response = await controlDevice(deviceId, command)
          
          set({ isControlling: false })
          
          // Refresh device data after control action
          setTimeout(() => {
            get().refreshDevice(deviceId)
          }, 2000) // Wait 2 seconds for device to update
          
          return response.success
          
        } catch (error) {
          const errorMessage = handleAPIError(error)
          set({
            error: errorMessage,
            isControlling: false,
          })
          console.error('Failed to control device:', error)
          return false
        }
      },

      // Utility actions
      clearError: () => {
        set({ error: null })
      },

      setError: (error: string) => {
        set({ error })
      },

      // Computed getters
      getDeviceById: (id: string) => {
        return get().devices.find(device => device.id === id)
      },

      getOnlineDevices: () => {
        return get().devices.filter(device => device.online)
      },

      getActiveDevices: () => {
        return get().devices.filter(device => device.isActive)
      },
    }),
    {
      name: 'device-store',
    }
  )
)