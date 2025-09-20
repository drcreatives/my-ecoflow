import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Device, DeviceReading } from '@/types'

interface DeviceState {
  devices: Device[]
  currentDevice: Device | null
  readings: DeviceReading[]
  isLoading: boolean
  error: string | null
}

interface DeviceActions {
  fetchDevices: () => Promise<void>
  selectDevice: (deviceId: string) => void
  updateDeviceStatus: (deviceId: string, status: Partial<Device>) => void
  addReading: (reading: DeviceReading) => void
  setDevices: (devices: Device[]) => void
  setReadings: (readings: DeviceReading[]) => void
  clearError: () => void
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
      error: null,

      // Actions
      fetchDevices: async () => {
        try {
          set({ isLoading: true, error: null })
          
          // This will be implemented when we connect to the actual API
          const response = await fetch('/api/devices')
          
          if (!response.ok) {
            throw new Error('Failed to fetch devices')
          }
          
          const devices = await response.json()
          
          set({
            devices,
            isLoading: false,
            error: null,
          })
        } catch (error: any) {
          set({
            isLoading: false,
            error: error.message || 'Failed to fetch devices',
          })
        }
      },

      selectDevice: (deviceId: string) => {
        const { devices } = get()
        const device = devices.find(d => d.id === deviceId)
        
        if (device) {
          set({ currentDevice: device })
        }
      },

      updateDeviceStatus: (deviceId: string, status: Partial<Device>) => {
        const { devices } = get()
        const updatedDevices = devices.map(device =>
          device.id === deviceId ? { ...device, ...status } : device
        )
        
        set({ devices: updatedDevices })
        
        // Update current device if it's the one being updated
        const { currentDevice } = get()
        if (currentDevice?.id === deviceId) {
          set({ currentDevice: { ...currentDevice, ...status } })
        }
      },

      addReading: (reading: DeviceReading) => {
        const { readings } = get()
        const updatedReadings = [reading, ...readings].slice(0, 1000) // Keep last 1000 readings
        
        set({ readings: updatedReadings })
      },

      setDevices: (devices: Device[]) => {
        set({ devices })
      },

      setReadings: (readings: DeviceReading[]) => {
        set({ readings })
      },

      clearError: () => {
        set({ error: null })
      },

      // Computed values
      getDeviceById: (id: string): Device | undefined => {
        const { devices } = get()
        return devices.find(device => device.id === id)
      },
    }),
    {
      name: 'device-store',
    }
  )
)