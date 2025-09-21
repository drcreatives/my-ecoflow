'use client'

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

interface DeviceData {
  id: string
  deviceSn: string
  deviceName: string
  deviceType?: string
  isActive: boolean
  online: boolean
  status?: string
  userId: string
  currentReading?: {
    batteryLevel?: number
    inputWatts?: number
    outputWatts?: number
    temperature?: number
    remainingTime?: number
    status?: string
  }
}

interface DeviceStatusCardProps {
  device: DeviceData
  isCompact?: boolean
}

export const DeviceStatusCard = ({ device, isCompact = false }: DeviceStatusCardProps) => {
  const [isRegistering, setIsRegistering] = useState(false)
  const [isUnregistering, setIsUnregistering] = useState(false)
  
  const batteryLevel = device.currentReading?.batteryLevel ?? 0
  const inputWatts = device.currentReading?.inputWatts ?? 0
  const outputWatts = device.currentReading?.outputWatts ?? 0
  const temperature = device.currentReading?.temperature ?? 20
  const remainingTime = device.currentReading?.remainingTime

  // Check if device is registered (has real UUID vs temp ID)
  const isRegistered = !device.id.startsWith('temp-')

  // Determine status color and text
  const getStatusInfo = () => {
    if (!device.online) {
      return { color: 'text-gray-400', bg: 'bg-gray-900', text: 'Offline' }
    }
    if (inputWatts > 10) {
      return { color: 'text-green-400', bg: 'bg-green-900', text: 'Charging' }
    }
    if (outputWatts > 10) {
      return { color: 'text-blue-400', bg: 'bg-blue-900', text: 'Discharging' }
    }
    return { color: 'text-accent-green', bg: 'bg-accent-green/10', text: 'Standby' }
  }

  const handleRegisterDevice = async () => {
    setIsRegistering(true)
    try {
      const response = await fetch('/api/register-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceSn: device.deviceSn,
          userId: device.userId
        })
      })

      if (response.ok) {
        // Refresh the page or update state to show the device as registered
        window.location.reload()
      } else {
        throw new Error('Failed to register device')
      }
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
      const response = await fetch('/api/unregister-device', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deviceSn: device.deviceSn,
          userId: device.userId
        })
      })

      if (response.ok) {
        // Refresh the page or update state to show the device as unregistered
        window.location.reload()
      } else {
        throw new Error('Failed to unregister device')
      }
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
      "bg-primary-dark rounded-lg border border-gray-700 hover:border-accent-green transition-all duration-200 group relative",
      isCompact ? "p-4" : "p-6"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <h3 className={cn(
            "font-bold text-accent-gray truncate",
            isCompact ? "text-base" : "text-lg"
          )}>
            {device.deviceName || device.deviceType || 'EcoFlow Device'}
          </h3>
          <p className="text-xs text-gray-400 truncate mt-1">
            {device.deviceSn}
          </p>
        </div>
        
        {/* Online Status */}
        <div className="flex items-center gap-2 ml-3">
          {device.online ? (
            <Wifi size={16} className="text-accent-green" />
          ) : (
            <WifiOff size={16} className="text-gray-400" />
          )}
          {!isCompact && (
            <ArrowRight 
              size={16} 
              className="text-gray-400 group-hover:text-accent-green transition-colors opacity-0 group-hover:opacity-100" 
            />
          )}
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2 mb-4">
        <div className={cn(
          "px-2 py-1 rounded-md text-xs font-medium border",
          statusInfo.bg,
          statusInfo.color,
          statusInfo.color.replace('text-', 'border-')
        )}>
          {statusInfo.text}
        </div>
        {device.isActive && (
          <div className="w-2 h-2 bg-accent-green rounded-full animate-pulse" />
        )}
      </div>

      {/* Analytics Registration Status */}
      <div className="mb-4 p-3 rounded-lg border border-gray-600 bg-gray-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isRegistered ? (
              <DatabaseZap size={16} className="text-accent-green" />
            ) : (
              <Database size={16} className="text-gray-400" />
            )}
            <div className="flex flex-col">
              <span className={cn(
                "text-sm font-medium",
                isRegistered ? "text-accent-green" : "text-gray-400"
              )}>
                {isRegistered ? "Analytics Enabled" : "Analytics Disabled"}
              </span>
              <span className="text-xs text-gray-500">
                {isRegistered 
                  ? "Device data is being collected for history and analytics" 
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
                className="flex items-center gap-1 px-2 py-1 text-xs border border-red-400 text-red-400 hover:bg-red-400 hover:text-white rounded transition-colors disabled:opacity-50"
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
                className="flex items-center gap-1 px-2 py-1 text-xs border border-accent-green text-accent-green hover:bg-accent-green hover:text-black rounded transition-colors disabled:opacity-50"
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
        isCompact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"
      )}>
        {/* Battery Level */}
        <div className="flex items-center gap-2">
          <Battery 
            size={isCompact ? 16 : 18} 
            className={cn(
              batteryLevel > 20 ? "text-accent-green" : "text-red-400"
            )} 
          />
          <div className="flex flex-col">
            <span className={cn(
              "font-semibold",
              isCompact ? "text-sm" : "text-base",
              batteryLevel > 20 ? "text-accent-green" : "text-red-400"
            )}>
              {batteryLevel}%
            </span>
            {!isCompact && (
              <span className="text-xs text-gray-400">Battery</span>
            )}
          </div>
        </div>

        {/* Input Power */}
        <div className="flex items-center gap-2">
          <Zap 
            size={isCompact ? 16 : 18} 
            className={inputWatts > 0 ? "text-green-400" : "text-gray-400"} 
          />
          <div className="flex flex-col">
            <span className={cn(
              "font-semibold",
              isCompact ? "text-sm" : "text-base",
              inputWatts > 0 ? "text-green-400" : "text-gray-400"
            )}>
              {inputWatts}W
            </span>
            {!isCompact && (
              <span className="text-xs text-gray-400">Input</span>
            )}
          </div>
        </div>

        {/* Output Power */}
        <div className="flex items-center gap-2">
          <Power 
            size={isCompact ? 16 : 18} 
            className={outputWatts > 0 ? "text-blue-400" : "text-gray-400"} 
          />
          <div className="flex flex-col">
            <span className={cn(
              "font-semibold",
              isCompact ? "text-sm" : "text-base",
              outputWatts > 0 ? "text-blue-400" : "text-gray-400"
            )}>
              {outputWatts}W
            </span>
            {!isCompact && (
              <span className="text-xs text-gray-400">Output</span>
            )}
          </div>
        </div>

        {/* Temperature */}
        <div className="flex items-center gap-2">
          <Thermometer 
            size={isCompact ? 16 : 18} 
            className={temperature > 40 ? "text-orange-400" : "text-gray-400"} 
          />
          <div className="flex flex-col">
            <span className={cn(
              "font-semibold",
              isCompact ? "text-sm" : "text-base",
              temperature > 40 ? "text-orange-400" : "text-accent-gray"
            )}>
              {temperature}°C
            </span>
            {!isCompact && (
              <span className="text-xs text-gray-400">Temp</span>
            )}
          </div>
        </div>
      </div>

      {/* Additional Info for non-compact view */}
      {!isCompact && remainingTime && remainingTime !== 0 && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-700">
          <Clock size={16} className="text-accent-green" />
          <span className="text-sm text-accent-gray">
            {formatRemainingTime(remainingTime)}
          </span>
        </div>
      )}

      {/* Offline Overlay */}
      {!device.online && (
        <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <WifiOff size={24} className="text-gray-400 mx-auto mb-2" />
            <span className="text-sm text-gray-400">Device Offline</span>
          </div>
        </div>
      )}
    </div>
  )
}