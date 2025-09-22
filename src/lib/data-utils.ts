/**
 * Data fetching utilities for EcoFlow dashboard
 * Provides typed functions to interact with our API routes
 */

export interface DeviceData {
  id: string
  deviceSn: string
  deviceName: string
  deviceType: string
  isActive: boolean
  online: boolean
  status: string
  userId: string
  createdAt?: string
  updatedAt?: string
  currentReading?: DeviceReading
}

export interface DeviceReading {
  id?: string
  deviceId: string
  batteryLevel?: number
  inputWatts?: number
  outputWatts?: number
  acOutputWatts?: number
  dcOutputWatts?: number
  usbOutputWatts?: number
  remainingTime?: number
  temperature?: number
  status?: string
  rawData?: Record<string, unknown>
  recordedAt: Date
}

export interface APIResponse<T> {
  data?: T
  error?: string
  message?: string
}

export interface DevicesResponse {
  devices: DeviceData[]
  total: number
}

export interface ReadingsResponse {
  readings: DeviceReading[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  timeRange: {
    start: string
    end: string
    range: string
  }
}

export interface ControlResponse {
  success: boolean
  message: string
  device: {
    id: string
    deviceSn: string
    deviceName: string
  }
  command: {
    cmdSet: number
    cmdId: number
    param: Record<string, unknown>
    timestamp: string
  }
}

/**
 * Fetch all user devices
 */
export async function fetchDevices(): Promise<DevicesResponse> {
  const response = await fetch('/api/devices', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch devices: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Register a new device
 */
export async function registerDevice(device: {
  deviceSn: string
  deviceName?: string
  deviceType?: string
}): Promise<{ device: DeviceData; message: string }> {
  const response = await fetch('/api/devices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(device),
  })

  if (!response.ok) {
    throw new Error(`Failed to register device: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Fetch device details with current reading
 */
export async function fetchDeviceDetails(deviceId: string): Promise<{
  device: DeviceData
  quotaData: Record<string, unknown>
}> {
  const response = await fetch(`/api/devices/${deviceId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch device details: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Fetch device readings with pagination and time filtering
 */
export async function fetchDeviceReadings(
  deviceId: string,
  options: {
    limit?: number
    offset?: number
    timeRange?: '1h' | '6h' | '24h' | '7d' | '30d'
  } = {}
): Promise<ReadingsResponse> {
  const searchParams = new URLSearchParams()
  
  if (options.limit) searchParams.append('limit', options.limit.toString())
  if (options.offset) searchParams.append('offset', options.offset.toString())
  if (options.timeRange) searchParams.append('timeRange', options.timeRange)

  const url = `/api/devices/${deviceId}/readings${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch device readings: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Control device function
 */
export async function controlDevice(
  deviceId: string,
  command: {
    cmdSet: number
    cmdId: number
    param: Record<string, unknown>
  }
): Promise<ControlResponse> {
  const response = await fetch(`/api/devices/${deviceId}/control`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })

  if (!response.ok) {
    throw new Error(`Failed to control device: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Common EcoFlow device commands
 */
export const DeviceCommands = {
  // AC Output Control
  toggleACOutput: (enabled: boolean) => ({
    cmdSet: 32,
    cmdId: 1,
    param: { enabled: enabled ? 1 : 0 }
  }),

  // DC Output Control  
  toggleDCOutput: (enabled: boolean) => ({
    cmdSet: 32,
    cmdId: 34,
    param: { enabled: enabled ? 1 : 0 }
  }),

  // USB Output Control
  toggleUSBOutput: (enabled: boolean) => ({
    cmdSet: 32,
    cmdId: 35,
    param: { enabled: enabled ? 1 : 0 }
  }),

  // Set AC Charging Speed (watts)
  setACChargingSpeed: (watts: number) => ({
    cmdSet: 32,
    cmdId: 69,
    param: { slowChgWatts: watts }
  }),

  // Set Car Charging Speed (watts)
  setCarChargingSpeed: (watts: number) => ({
    cmdSet: 32,
    cmdId: 81,
    param: { chgWatts: watts }
  }),

  // Standby Timeout (minutes)
  setStandbyTimeout: (minutes: number) => ({
    cmdSet: 32,
    cmdId: 33,
    param: { standbyMin: minutes }
  }),

  // LCD Brightness (0-100)
  setLCDBrightness: (brightness: number) => ({
    cmdSet: 32,
    cmdId: 39,
    param: { lcdTime: brightness }
  }),
}

/**
 * Error handler for API calls
 */
export function handleAPIError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  
  if (typeof error === 'string') {
    return error
  }
  
  return 'An unexpected error occurred'
}

/**
 * Utility function to format device status
 */
export function formatDeviceStatus(status: string): {
  label: string
  color: string
  icon: string
} {
  switch (status?.toLowerCase()) {
    case 'charging':
      return { label: 'Charging', color: 'green', icon: 'charging' }
    case 'discharging':
      return { label: 'Discharging', color: 'blue', icon: 'discharging' }
    case 'full':
      return { label: 'Full', color: 'green', icon: 'full' }
    case 'low':
      return { label: 'Low Battery', color: 'red', icon: 'low' }
    case 'standby':
      return { label: 'Standby', color: 'gray', icon: 'standby' }
    case 'offline':
      return { label: 'Offline', color: 'gray', icon: 'offline' }
    default:
      return { label: 'Unknown', color: 'gray', icon: 'unknown' }
  }
}

/**
 * Format power values with appropriate units
 */
export function formatPowerValue(watts: number): string {
  if (watts >= 1000) {
    return `${(watts / 1000).toFixed(1)}kW`
  }
  return `${watts}W`
}

/**
 * Format battery percentage
 */
export function formatBatteryLevel(level: number): string {
  return `${Math.round(level)}%`
}

/**
 * Format remaining time based on EcoFlow API logic
 * Positive values = time until full charge
 * Negative values = time until full discharge 
 */
export function formatRemainingTime(minutes: number | null | undefined): string {
  if (!minutes || minutes === 0) return 'N/A'
  
  // Get absolute value for time calculation
  const absoluteMinutes = Math.abs(minutes)
  
  // Determine if charging or discharging
  const isCharging = minutes > 0
  const isDischarging = minutes < 0
  
  // Format the time
  let timeStr = ''
  if (absoluteMinutes < 60) {
    timeStr = `${absoluteMinutes}m`
  } else if (absoluteMinutes < 1440) { // Less than 24 hours
    const hours = Math.floor(absoluteMinutes / 60)
    const remainingMins = absoluteMinutes % 60
    timeStr = remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`
  } else { // 24 hours or more
    const totalHours = Math.floor(absoluteMinutes / 60)
    const days = Math.floor(totalHours / 24)
    const remainingHours = totalHours % 24
    timeStr = remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }
  
  // Add appropriate suffix based on charging/discharging
  if (isCharging) {
    return `${timeStr} until full`
  } else if (isDischarging) {
    return `${timeStr} remaining`
  }
  
  return timeStr
}

/**
 * Format temperature
 */
export function formatTemperature(temp: number, unit: 'C' | 'F' = 'C'): string {
  if (unit === 'F') {
    return `${Math.round((temp * 9/5) + 32)}°F`
  }
  return `${Math.round(temp)}°C`
}