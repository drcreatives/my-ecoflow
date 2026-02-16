import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// EcoFlow design system utilities
export const ecoflowStyles = {
  // Backgrounds
  bg: {
    primary: 'bg-bg-base',
    primaryDark: 'bg-surface-1',
    card: 'bg-surface-1',
    input: 'bg-surface-2',
  },
  
  // Text colors
  text: {
    primary: 'text-text-primary',
    secondary: 'text-text-secondary',
    muted: 'text-text-muted',
    accent: 'text-brand-primary',
    error: 'text-danger',
    warning: 'text-warning',
  },
  
  // Borders
  border: {
    default: 'border border-stroke-subtle',
    strong: 'border border-stroke-strong',
    accent: 'border border-brand-primary',
    error: 'border border-danger',
    success: 'border border-brand-primary',
  },
  
  // Buttons
  button: {
    primary: 'bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160',
    secondary: 'bg-surface-2 hover:bg-surface-1 text-text-primary border border-stroke-strong py-2 px-4 rounded-pill transition-all duration-160',
    ghost: 'hover:bg-surface-2 text-text-secondary hover:text-text-primary py-2 px-4 rounded-pill transition-all duration-160',
    pill: 'rounded-pill border border-stroke-strong px-4 py-2 text-text-primary hover:bg-surface-2 text-xs font-medium transition-all duration-160',
  },
  
  // Inputs
  input: {
    default: cn(
      'w-full h-12 px-4 py-3 bg-surface-2 border border-stroke-subtle',
      'text-text-primary placeholder-text-muted rounded-inner',
      'focus:outline-none focus:ring-1 focus:ring-brand-primary/40 focus:border-brand-primary',
      'transition-all duration-160'
    ),
    error: cn(
      'w-full h-12 px-4 py-3 bg-surface-2 border border-danger',
      'text-text-primary placeholder-text-muted rounded-inner',
      'focus:outline-none focus:ring-1 focus:ring-danger/40',
      'transition-all duration-160'
    ),
  },
  
  // Cards
  card: {
    default: 'bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]',
    accent: 'bg-surface-1 border border-brand-primary/20 rounded-card shadow-card p-[18px]',
    hero: 'bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px] col-span-2',
  },
  
  // Layout
  layout: {
    container: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
    page: 'min-h-screen bg-bg-base text-text-primary',
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
  if (level > 50) return '#44af21' // brand-primary
  if (level > 20) return '#ffa500' // warning
  return '#ff4444' // danger
}

/**
 * Get battery status Tailwind class based on level
 */
export function getBatteryStatusClass(level: number): string {
  if (level > 50) return 'text-brand-primary'
  if (level > 20) return 'text-warning'
  return 'text-danger'
}

/**
 * Get device status badge color
 */
export function getDeviceStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'online':
    case 'charging':
      return '#44af21' // brand-primary
    case 'discharging':
      return '#00c356' // brand-secondary
    case 'offline':
      return '#666666' // muted
    case 'error':
      return '#ff4444' // danger
    default:
      return '#3a6fe3' // brand-tertiary
  }
}

/**
 * Get device status Tailwind class based on status
 */
export function getDeviceStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'online':
    case 'charging':
      return 'text-brand-primary'
    case 'discharging':
      return 'text-brand-secondary'
    case 'offline':
      return 'text-text-muted'
    case 'error':
      return 'text-danger'
    default:
      return 'text-brand-tertiary'
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
export function debounce<T extends (...args: unknown[]) => unknown>(
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