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
  acInputWatts?: number    // AC wall charging input
  dcInputWatts?: number    // DC/Solar/Car charging input (MPPT)
  chargingType?: number    // 0=null, 1=Adapter/DC, 2=Solar, 3=AC, 4=Gas, 5=Wind
  outputWatts?: number // Total output power (AC + DC) from pd.wattsOutSum
  acOutputWatts?: number
  dcOutputWatts?: number
  usbOutputWatts?: number
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

// API Error types
export interface APIError {
  message: string
  code?: string
  statusCode?: number
  details?: Record<string, unknown>
}