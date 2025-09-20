import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format power value with appropriate units
 */
export function formatPowerValue(watts: number): string {
  if (watts >= 1000) {
    return `${(watts / 1000).toFixed(1)}kW`
  }
  return `${watts.toFixed(0)}W`
}

/**
 * Format battery percentage
 */
export function formatBatteryLevel(level: number): string {
  return `${level}%`
}

/**
 * Format temperature with unit
 */
export function formatTemperature(temp: number, unit: 'C' | 'F' = 'C'): string {
  if (unit === 'F') {
    temp = (temp * 9/5) + 32
  }
  return `${temp.toFixed(1)}°${unit}`
}

/**
 * Format time remaining
 */
export function formatTimeRemaining(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

/**
 * Calculate energy efficiency
 */
export function calculateEfficiency(inputWatts: number, outputWatts: number): number {
  if (inputWatts === 0) return 0
  return (outputWatts / inputWatts) * 100
}

/**
 * Get battery status color based on level
 */
export function getBatteryStatusColor(level: number): string {
  if (level > 50) return '#44af21' // Green
  if (level > 20) return '#ffa500' // Orange
  return '#ff4444' // Red
}

/**
 * Get device status badge color
 */
export function getDeviceStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'online':
    case 'charging':
      return '#44af21' // Green
    case 'discharging':
      return '#00c356' // Green secondary
    case 'offline':
      return '#666666' // Gray
    case 'error':
      return '#ff4444' // Red
    default:
      return '#3a6fe3' // Blue
  }
}

/**
 * Validate device serial number format
 */
export function isValidDeviceSN(deviceSN: string): boolean {
  // EcoFlow device serial numbers are typically alphanumeric
  return /^[A-Z0-9]{10,20}$/i.test(deviceSN)
}

/**
 * Debounce function for API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 Bytes'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${Math.round(bytes / Math.pow(1024, i) * 100) / 100} ${sizes[i]}`
}

/**
 * Generate random ID
 */
export function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}