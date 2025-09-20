import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// EcoFlow design system utilities
export const ecoflowStyles = {
  // Backgrounds
  bg: {
    primary: 'bg-primary-black',
    primaryDark: 'bg-primary-dark',
    card: 'bg-gray-900/50 backdrop-blur-sm',
    input: 'bg-gray-800/50',
  },
  
  // Text colors
  text: {
    primary: 'text-accent-gray',
    secondary: 'text-gray-400',
    accent: 'text-accent-green',
    error: 'text-red-400',
    warning: 'text-status-warning',
  },
  
  // Borders
  border: {
    default: 'border border-gray-700',
    accent: 'border border-accent-green',
    error: 'border border-red-500',
    success: 'border border-accent-green',
  },
  
  // Buttons
  button: {
    primary: 'bg-accent-green hover:bg-accent-green-secondary text-black font-medium py-2 px-4 rounded-lg transition-colors',
    secondary: 'bg-gray-800 hover:bg-gray-700 text-accent-gray border border-gray-600 py-2 px-4 rounded-lg transition-colors',
    ghost: 'hover:bg-gray-800/50 text-accent-gray py-2 px-4 rounded-lg transition-colors',
  },
  
  // Inputs
  input: {
    default: cn(
      'w-full h-12 px-4 py-3 bg-gray-800/50 border border-gray-700',
      'text-white placeholder-gray-500 rounded-lg',
      'focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green',
      'transition-all'
    ),
    error: cn(
      'w-full h-12 px-4 py-3 bg-gray-800/50 border border-red-500',
      'text-white placeholder-gray-500 rounded-lg',
      'focus:outline-none focus:ring-2 focus:ring-red-500/20',
      'transition-all'
    ),
  },
  
  // Cards
  card: {
    default: 'bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-6 shadow-2xl',
    accent: 'bg-gray-900/50 backdrop-blur-sm border border-accent-green/30 rounded-2xl p-6 shadow-2xl',
  },
  
  // Layout
  layout: {
    container: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
    page: 'min-h-screen bg-primary-black text-accent-gray',
    section: 'py-8 md:py-12',
  },
  
  // Status indicators
  status: {
    online: 'text-status-online',
    offline: 'text-status-offline',
    charging: 'text-status-charging',
    error: 'text-status-error',
    warning: 'text-status-warning',
  },
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