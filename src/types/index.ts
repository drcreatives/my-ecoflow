// Core application types for EcoFlow Dashboard

export interface User {
  id: string
  email: string
  createdAt: Date
  updatedAt: Date
}

export interface Device {
  id: string
  userId: string
  deviceSn: string
  deviceName?: string
  deviceType: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface DeviceReading {
  id: string
  deviceId: string
  batteryLevel?: number
  inputWatts?: number
  outputWatts?: number
  remainingTime?: number // in minutes: positive = time until full charge, negative = time until full discharge
  temperature?: number
  status?: string
  rawData?: Record<string, unknown>
  recordedAt: Date
}

export interface DeviceSetting {
  id: string
  deviceId: string
  settingKey: string
  settingValue?: string
  updatedAt: Date
}

export interface DailySummary {
  id: string
  deviceId: string
  date: Date
  avgBatteryLevel?: number
  totalEnergyIn?: number
  totalEnergyOut?: number
  maxTemperature?: number
  minTemperature?: number
  totalRuntime?: number // in minutes
}

export interface Alert {
  id: string
  deviceId: string
  type: AlertType
  title: string
  message: string
  severity: AlertSeverity
  isRead: boolean
  createdAt: Date
}

export enum AlertType {
  BATTERY_LOW = 'BATTERY_LOW',
  TEMPERATURE_HIGH = 'TEMPERATURE_HIGH',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  POWER_OVERLOAD = 'POWER_OVERLOAD',
  CHARGING_ERROR = 'CHARGING_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR'
}

export enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// EcoFlow API specific types
export interface EcoFlowDevice {
  deviceSn: string
  deviceName: string
  deviceType: string
  onlineStatus: boolean
}

export interface EcoFlowDeviceStatus {
  deviceSn: string
  batteryLevel: number
  inputWatts: number
  outputWatts: number
  remainingTime: number
  temperature: number
  status: string
  timestamp: Date
}

export interface EcoFlowAPIResponse<T = Record<string, unknown>> {
  code: string
  message: string
  data: T
}

// UI Component types
export interface TimeRange {
  start: Date
  end: Date
  label: string
}

export interface ChartDataPoint {
  timestamp: Date
  value: number
  label?: string
}

export interface MetricCardData {
  title: string
  value: string | number
  unit?: string
  change?: number
  changeType?: 'increase' | 'decrease'
  icon?: string
  color?: string
}

// Form types
export interface LoginCredentials {
  email: string
  password: string
}

export interface DeviceRegistration {
  deviceSn: string
  deviceName: string
}

// Store types
export interface DeviceStore {
  devices: Device[]
  currentDevice: Device | null
  readings: DeviceReading[]
  isLoading: boolean
  error: string | null
  
  // Actions
  fetchDevices: () => Promise<void>
  selectDevice: (deviceId: string) => void
  updateDeviceStatus: (deviceId: string, status: Partial<Device>) => void
  addReading: (reading: DeviceReading) => void
  clearError: () => void
}

export interface AuthStore {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  
  // Actions
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
  checkAuth: () => Promise<void>
}

export interface UIStore {
  theme: 'dark'
  sidebarOpen: boolean
  notifications: Alert[]
  
  // Actions
  toggleSidebar: () => void
  addNotification: (notification: Alert) => void
  removeNotification: (id: string) => void
  markNotificationAsRead: (id: string) => void
}

// API Error types
export interface APIError {
  message: string
  code?: string
  statusCode?: number
  details?: Record<string, unknown>
}