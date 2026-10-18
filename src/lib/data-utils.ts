/**
 * Data types and formatting utilities for EcoFlow dashboard
 * API fetch functions removed — data is now fetched via Convex reactive queries
 */
import type { ChargingTypeSource, DcInputSource, DisplayTelemetry } from '@/types'
import type { ReadingFreshness } from '@/lib/reading-status'

export interface DeviceData {
  id: string
  deviceSn: string
  deviceName: string
  deviceType?: string
  isActive: boolean
  dcInputSource?: DcInputSource
  displayTelemetry?: DisplayTelemetry | null
  temperatureRefreshing?: boolean
  online: boolean
  status?: string
  connectionStatus?: 'online' | 'offline' | 'error' | null
  readingFreshness?: ReadingFreshness
  userId: string
  createdAt?: string | number
  updatedAt?: string | number
  currentReading?: DeviceReading | null
}

export interface DeviceReading {
  id?: string
  deviceId?: string
  readingKind?: 'temperature' | null
  temperatureMeasurement?: 'bms-generic-mqtt-v1' | null
  temperatureSampleCount?: number
  batteryLevel?: number | null
  inputWatts?: number | null
  acInputWatts?: number | null    // AC wall charging input
  dcInputWatts?: number | null    // DC/Solar/Car charging input (MPPT)
  chargingType?: number | null    // 0=null, 1=Adapter/DC, 2=Solar, 3=AC, 4=Gas, 5=Wind
  chargingTypeSource?: ChargingTypeSource | null
  inputQuality?: 'consistent' | 'inconsistent' | 'incomplete' | null
  inputMeasurement?: 'delta2-pd-v1' | 'delta2-pd-mqtt-v1' | 'legacy-modules' | null
  solarInputWatts?: number | null
  powerMeasurement?: 'pd-totals-mqtt-v1' | null
  solarPanelInputWatts?: number | null // Independent panel-side measurement, not station solarInputWatts
  solarPanelReceivedAt?: number | null
  solarPanelMeasurement?: 'delta2-mppt-mqtt-v1' | null
  // Derived history-bucket statistics; never individual sensor receipts.
  solarPanelAverageWatts?: number | null
  solarPanelSampleCount?: number
  sampleCount?: number
  outputWatts?: number | null
  acOutputWatts?: number | null
  dcOutputWatts?: number | null
  usbOutputWatts?: number | null
  remainingTime?: number | null
  temperature?: number | null
  status?: string | null
  rawData?: Record<string, unknown>
  recordedAt: Date | number
  acChargingWatts?: number | null
  acChargingPaused?: boolean | null
  dcChargingCurrent?: number | null
}

/** A sensor report, or an explicitly counted display average of reports. */
export interface TemperatureHistoryReading {
  deviceId: string
  deviceName: string
  deviceSn: string
  temperature: number
  recordedAt: number
  temperatureSampleCount: number
  temperatureMeasurement: 'bms-generic-mqtt-v1' | null
}

// ─── Formatting Utilities ─────────────────────────────────────────────────────

/** Missing measurements are unavailable, not measured zero. */
export function formatMeasurementValue(
  value: number | null | undefined,
  unit: string,
  fractionDigits = 1,
): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(fractionDigits)}${unit}`
    : '—'
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
