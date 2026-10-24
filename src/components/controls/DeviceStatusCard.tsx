'use client'

import { TEMPERATURE_FEATURE_ENABLED } from '@/lib/features'
import { 
  Battery, 
  Zap, 
  Thermometer, 
  Clock,
  Power,
  Wifi,
  WifiOff,
  ArrowRight,
  Database,
  DatabaseZap,
  Plus,
  X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRemainingTime } from '@/lib/data-utils'
import { useState } from 'react'
import { useConvexDeviceMutations } from '@/hooks/useConvexData'
import { getInputLabel, getInputSourceDescription, getReadingFreshness, type InputQuality, type InputSourceReading, type ReadingFreshness } from '@/lib/reading-status'
import { resolveTemperatureMetric } from '@/lib/display-telemetry'
import type { DisplayTelemetry } from '@/types'
import { TemperatureStatus } from './TemperatureStatus'

interface DeviceData {
  id: string
  deviceSn: string
  deviceName: string
  deviceType?: string
  isActive: boolean
  online: boolean
  status?: string
  userId: string
  connectionStatus?: 'online' | 'offline' | 'error' | null
  readingFreshness?: ReadingFreshness
  displayTelemetry?: DisplayTelemetry | null
  temperatureRefreshing?: boolean
  currentReading?: InputSourceReading & {
    batteryLevel?: number | null
    inputWatts?: number | null
    acInputWatts?: number | null
    dcInputWatts?: number | null
    chargingType?: number | null
    inputQuality?: InputQuality | null
    recordedAt?: number | Date | string | null
    outputWatts?: number | null
    temperature?: number | null
    remainingTime?: number | null
    status?: string | null
    [key: string]: unknown
  } | null
}

interface DeviceStatusCardProps {
  device: DeviceData
  isCompact?: boolean
}

export const DeviceStatusCard = ({ device, isCompact = false }: DeviceStatusCardProps) => {
  const [isRegistering, setIsRegistering] = useState(false)
  const [isUnregistering, setIsUnregistering] = useState(false)
  const { registerDevice, unregisterDevice } = useConvexDeviceMutations()
  
  const rawBatteryLevel = device.currentReading?.batteryLevel
  const batteryLevel = typeof rawBatteryLevel === 'number' && Number.isFinite(rawBatteryLevel) ? rawBatteryLevel : null
  const inputWatts = device.currentReading?.inputWatts ?? 0
  const outputWatts = device.currentReading?.outputWatts ?? 0
  const inputLabel = getInputLabel(device.currentReading)
  const inputSourceDescription = getInputSourceDescription(device.currentReading)
  const temperatureMetric = resolveTemperatureMetric(device.displayTelemetry?.temperature)
  const temperature = temperatureMetric.value
  const batteryColor = batteryLevel === null ? 'text-text-muted' : batteryLevel > 20 ? 'text-brand-primary' : 'text-danger'
  const remainingTime = device.currentReading?.remainingTime
  const readingFreshness = device.readingFreshness ?? getReadingFreshness(device.currentReading?.recordedAt)
  const confirmedOffline = device.connectionStatus === 'offline' ||
    (!device.connectionStatus && !device.online && readingFreshness === 'recent')

  // Check if device is registered (has real UUID vs temp ID)
  const isRegistered = !device.id.startsWith('temp-')

  // Determine status color and text based on NET power flow
  // The device can have simultaneous input (e.g. solar) and output (e.g. loads),
  // so we compare them to determine the actual charging state.
  const getStatusInfo = () => {
    if (device.connectionStatus === 'error') {
      return { color: 'text-warning', bg: 'bg-warning/10', text: 'Refresh failed' }
    }
    if (confirmedOffline) {
      return { color: 'text-text-muted', bg: 'bg-surface-2', text: 'Offline' }
    }
    if (readingFreshness === 'missing') {
      return { color: 'text-text-muted', bg: 'bg-surface-2', text: 'No readings' }
    }
    if (readingFreshness === 'stale') {
      return { color: 'text-warning', bg: 'bg-warning/10', text: 'Reading stale' }
    }
    if (device.currentReading?.inputWatts == null || device.currentReading.outputWatts == null) {
      return { color: 'text-text-muted', bg: 'bg-surface-2', text: 'Power unavailable' }
    }
    const netPower = inputWatts - outputWatts
    if (netPower > 10) {
      return { color: 'text-brand-primary', bg: 'bg-brand-primary/10', text: 'Charging' }
    }
    if (netPower < -10) {
      return { color: 'text-brand-tertiary', bg: 'bg-brand-tertiary/10', text: 'Discharging' }
    }
    if (inputWatts > 10 || outputWatts > 10) {
      return { color: 'text-brand-secondary', bg: 'bg-brand-secondary/10', text: 'Pass-through' }
    }
    return { color: 'text-brand-primary', bg: 'bg-brand-primary/10', text: 'Standby' }
  }

  const handleRegisterDevice = async () => {
    setIsRegistering(true)
    try {
      await registerDevice(device.deviceSn, device.deviceName)
      // Convex is reactive — UI will update automatically
    } catch (error) {
      console.error('Registration error:', error)
      alert('Failed to register device for analytics. Please try again.')
    } finally {
      setIsRegistering(false)
    }
  }

  const handleUnregisterDevice = async () => {
    setIsUnregistering(true)
    try {
      await unregisterDevice(device.id)
      // Convex is reactive — UI will update automatically
    } catch (error) {
      console.error('Unregistration error:', error)
      alert('Failed to unregister device. Please try again.')
    } finally {
      setIsUnregistering(false)
    }
  }

  const statusInfo = getStatusInfo()

  return (
    <div className={cn(
      "bg-surface-1 rounded-card border border-stroke-subtle hover:border-brand-primary/30 shadow-card transition-all duration-160 ease-dashboard group relative",
      isCompact ? "p-4" : "p-6"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className={cn(
            "font-bold text-text-primary truncate",
            isCompact ? "text-base" : "text-lg"
          )}>
            {device.deviceName || device.deviceType || 'EcoFlow Device'}
          </h3>
          <p className="text-xs text-text-muted truncate mt-1">
            {device.deviceSn}
          </p>
        </div>
        
        {/* Online Status */}
        <div className="flex items-center gap-2 ml-3">
          {device.online ? (
            <Wifi size={16} className="text-brand-primary" />
          ) : (
            <WifiOff size={16} className="text-text-muted" />
          )}
          {!isCompact && (
            <ArrowRight 
              size={16} 
              className="text-text-muted group-hover:text-brand-primary transition-colors opacity-0 group-hover:opacity-100" 
            />
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2 mb-4">
        <div className={cn(
          "px-2 py-1 rounded-pill text-xs font-medium border",
          statusInfo.bg,
          statusInfo.color,
          statusInfo.color.replace('text-', 'border-')
        )}>
          {statusInfo.text}
        </div>
        {device.isActive && device.online && readingFreshness === 'recent' && (
          <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" />
        )}
      </div>

      {/* Analytics Registration Status */}
      <div className="mb-4 p-3 rounded-inner border border-stroke-subtle bg-surface-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRegistered ? (
              <DatabaseZap size={16} className="text-brand-primary" />
            ) : (
              <Database size={16} className="text-text-muted" />
            )}
            <div className="flex flex-col">
              <span className={cn(
                "text-sm font-medium",
                isRegistered ? "text-brand-primary" : "text-text-muted"
              )}>
                {isRegistered ? "Analytics Enabled" : "Analytics Disabled"}
              </span>
              <span className="text-xs text-text-muted">
                {isRegistered 
                  ? "Device registered for history and analytics collection"
                  : "Register device to enable data collection and analytics"
                }
              </span>
            </div>
          </div>
          
          {/* Registration Controls */}
          <div className="ml-2">
            {isRegistered ? (
              <button
                onClick={handleUnregisterDevice}
                disabled={isUnregistering}
                className="flex items-center gap-1 px-2 py-1 text-xs border border-danger text-danger hover:bg-danger hover:text-bg-base rounded-pill transition-colors disabled:opacity-50"
              >
                {isUnregistering ? (
                  <>
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <X size={12} />
                    <span>Disable</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleRegisterDevice}
                disabled={isRegistering}
                className="flex items-center gap-1 px-2 py-1 text-xs border border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-bg-base rounded-pill transition-colors disabled:opacity-50"
              >
                {isRegistering ? (
                  <>
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    <span>Enabling...</span>
                  </>
                ) : (
                  <>
                    <Plus size={12} />
                    <span>Enable</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className={cn(
        "grid gap-3",
        isCompact ? "grid-cols-2" : TEMPERATURE_FEATURE_ENABLED ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"
      )}>
        {/* Battery Level */}
        <div className="flex items-center gap-2">
          <Battery 
            size={isCompact ? 16 : 18} 
            className={batteryColor}
          />
          <div className="flex flex-col">
            <span className={cn(
              "font-semibold",
              isCompact ? "text-sm" : "text-base",
              batteryColor
            )} aria-label={batteryLevel === null ? 'Battery level unavailable' : `Battery level ${batteryLevel}%`}>
              {batteryLevel === null ? '—' : `${batteryLevel}%`}
            </span>
            {!isCompact && (
              <span className="text-xs text-text-muted">Battery</span>
            )}
          </div>
        </div>

        {/* Input Power */}
        <div className="flex items-center gap-2">
          <Zap 
            size={isCompact ? 16 : 18} 
            className={inputWatts > 0 ? "text-brand-primary" : "text-text-muted"} 
          />
          <div className="flex flex-col">
            <span className={cn(
              "font-semibold",
              isCompact ? "text-sm" : "text-base",
              inputWatts > 0 ? "text-brand-primary" : "text-text-muted"
            )}>
              {device.currentReading?.inputWatts == null ? '—' : `${inputWatts}W`}
            </span>
            <span className={cn('text-xs text-text-muted', inputLabel === 'Solar active' && 'whitespace-nowrap')} title={inputSourceDescription} aria-description={inputSourceDescription}>
              {inputLabel}
            </span>
          </div>
        </div>

        {/* Output Power */}
        <div className="flex items-center gap-2">
          <Power 
            size={isCompact ? 16 : 18} 
            className={outputWatts > 0 ? "text-brand-tertiary" : "text-text-muted"} 
          />
          <div className="flex flex-col">
            <span className={cn(
              "font-semibold",
              isCompact ? "text-sm" : "text-base",
              outputWatts > 0 ? "text-brand-tertiary" : "text-text-muted"
            )}>
              {device.currentReading?.outputWatts == null ? '—' : `${outputWatts}W`}
            </span>
            {!isCompact && (
              <span className="text-xs text-text-muted">Output</span>
            )}
          </div>
        </div>

        {/* Temperature */}
        {TEMPERATURE_FEATURE_ENABLED && (<div className="flex items-center gap-2">
          <Thermometer 
            size={isCompact ? 16 : 18} 
            className={temperatureMetric.status === 'reported' && temperature !== null && temperature > 40 ? "text-warning" : "text-text-muted"}
          />
          <div className="flex flex-col">
            <span className={cn(
              "font-semibold",
              isCompact ? "text-sm" : "text-base",
              temperatureMetric.status !== 'reported' ? 'text-text-muted' : temperature !== null && temperature > 40 ? "text-warning" : "text-text-primary"
            )} aria-label={temperature === null ? 'Temperature unavailable' : `Temperature ${temperature}°C`} aria-description={temperatureMetric.label}>
              {temperature === null ? '—' : `${temperature}°C`}
            </span>
            <TemperatureStatus metric={temperatureMetric} refreshing={device.temperatureRefreshing} compact />
          </div>
        </div>)}
      </div>

      {/* Additional Info for non-compact view */}
      {!isCompact && remainingTime && remainingTime !== 0 && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-stroke-subtle">
          <Clock size={16} className="text-brand-primary" />
          <span className="text-sm text-text-secondary">
            {formatRemainingTime(remainingTime)}
          </span>
        </div>
      )}

      {/* Offline Overlay */}
      {confirmedOffline && (
        <div className="absolute inset-0 bg-bg-base/60 rounded-card flex items-center justify-center">
          <div className="text-center">
            <WifiOff size={24} className="text-text-muted mx-auto mb-2" />
            <span className="text-sm text-text-muted">Device Offline</span>
          </div>
        </div>
      )}
    </div>
  )
}
