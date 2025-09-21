'use client'

import { useEffect, useState } from 'react'
import { formatRemainingTime } from '@/lib/data-utils'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Battery, 
  Zap, 
  Thermometer, 
  Clock, 
  Wifi, 
  WifiOff,
  Activity,
  Settings,
  Power,
  TrendingUp,
  TrendingDown,
  AlertTriangle
} from 'lucide-react'
import { DeviceData } from '@/lib/data-utils'

interface DevicePageProps {
  params: { deviceId: string }
}

export default function DevicePage({ params }: DevicePageProps) {
  const router = useRouter()
  const [device, setDevice] = useState<DeviceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDeviceDetails()
  }, [params.deviceId])

  const fetchDeviceDetails = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/devices')
      if (!response.ok) {
        throw new Error('Failed to fetch devices')
      }
      
      const data: { devices: DeviceData[], total: number } = await response.json()
      const deviceData = data.devices.find(d => d.id === params.deviceId)
      
      if (!deviceData) {
        throw new Error('Device not found')
      }
      
      setDevice(deviceData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'connected':
      case 'online':
        return 'text-accent-green'
      case 'charging':
        return 'text-accent-blue'
      case 'discharging':
        return 'text-yellow-400'
      case 'offline':
      case 'disconnected':
        return 'text-red-400'
      default:
        return 'text-accent-gray'
    }
  }

  const getBatteryColor = (level: number): string => {
    if (level > 60) return 'text-accent-green'
    if (level > 30) return 'text-yellow-400'
    return 'text-red-400'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-primary-black text-accent-gray">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
          <div className="animate-pulse">
            <div className="h-8 bg-primary-dark rounded w-48 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 bg-primary-dark rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-primary-black text-accent-gray flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Error Loading Device</h1>
          <p className="text-accent-gray mb-6">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-accent-green hover:bg-accent-green/80 text-primary-black px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (!device) {
    return (
      <div className="min-h-screen bg-primary-black text-accent-gray flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Device Not Found</h1>
          <p className="text-accent-gray mb-6">The device you&apos;re looking for doesn&apos;t exist.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-accent-green hover:bg-accent-green/80 text-primary-black px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  const reading = device.currentReading

  return (
    <div className="min-h-screen bg-primary-black text-accent-gray">
      <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 hover:bg-primary-dark rounded-lg transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 group-hover:text-accent-green transition-colors" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{device.deviceName}</h1>
              <div className="flex items-center space-x-3 mt-1">
                <span className="text-accent-gray text-sm">SN: {device.deviceSn}</span>
                <div className="flex items-center space-x-1">
                  {device.online ? (
                    <Wifi className="w-4 h-4 text-accent-green" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-red-400" />
                  )}
                  <span className={`text-sm font-medium ${device.online ? 'text-accent-green' : 'text-red-400'}`}>
                    {device.online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <button className="p-2 hover:bg-primary-dark rounded-lg transition-colors group">
            <Settings className="w-6 h-6 group-hover:text-accent-green transition-colors" />
          </button>
        </div>

        {/* Status Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          {/* Battery Level */}
          <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-4 sm:p-6 hover:border-accent-green/40 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Battery className={`w-5 h-5 ${getBatteryColor(reading?.batteryLevel || 0)}`} />
                <span className="text-accent-gray text-sm font-medium">Battery</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className={`text-2xl font-bold ${getBatteryColor(reading?.batteryLevel || 0)}`}>
                {reading?.batteryLevel || 0}%
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-300 ${
                    (reading?.batteryLevel || 0) > 60 ? 'bg-accent-green' :
                    (reading?.batteryLevel || 0) > 30 ? 'bg-yellow-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${reading?.batteryLevel || 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Power Input */}
          <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-4 sm:p-6 hover:border-accent-green/40 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-accent-blue" />
                <span className="text-accent-gray text-sm font-medium">Power In</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-accent-blue">
              {reading?.inputWatts || 0}W
            </div>
            <div className="text-xs text-accent-gray mt-1">
              {(reading?.inputWatts || 0) > 0 ? 'Charging' : 'Not charging'}
            </div>
          </div>

          {/* Power Output */}
          <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-4 sm:p-6 hover:border-accent-green/40 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <TrendingDown className="w-5 h-5 text-yellow-400" />
                <span className="text-accent-gray text-sm font-medium">Power Out</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-yellow-400">
              {reading?.outputWatts || 0}W
            </div>
            <div className="text-xs text-accent-gray mt-1">
              {(reading?.outputWatts || 0) > 0 ? 'In use' : 'Standby'}
            </div>
          </div>

          {/* Temperature */}
          <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-4 sm:p-6 hover:border-accent-green/40 transition-colors">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Thermometer className="w-5 h-5 text-accent-green" />
                <span className="text-accent-gray text-sm font-medium">Temperature</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-accent-green">
              {reading?.temperature || 20}°C
            </div>
            <div className="text-xs text-accent-gray mt-1">
              {(reading?.temperature || 20) < 45 ? 'Normal' : 'High'}
            </div>
          </div>
        </div>

        {/* Additional Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Device Status */}
          <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <Activity className="w-5 h-5 text-accent-green" />
              <span>Device Status</span>
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-accent-gray">Status</span>
                <span className={`font-medium capitalize ${getStatusColor(reading?.status || device.status)}`}>
                  {reading?.status || device.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-accent-gray">Device Type</span>
                <span className="text-white font-medium">{device.deviceType}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-accent-gray">Active</span>
                <span className={`font-medium ${device.isActive ? 'text-accent-green' : 'text-red-400'}`}>
                  {device.isActive ? 'Yes' : 'No'}
                </span>
              </div>
              {reading?.remainingTime && (
                <div className="flex justify-between items-center">
                  <span className="text-accent-gray">Remaining Time</span>
                  <span className="text-white font-medium flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>{formatRemainingTime(reading.remainingTime)}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
              <Power className="w-5 h-5 text-accent-green" />
              <span>Quick Actions</span>
            </h3>
            <div className="space-y-3">
              <button className="w-full bg-accent-green hover:bg-accent-green/80 text-primary-black px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2">
                <Zap className="w-4 h-4" />
                <span>Start Charging</span>
              </button>
              <button className="w-full bg-primary-black hover:bg-gray-800 text-accent-gray border border-accent-gray/30 hover:border-accent-gray/50 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2">
                <Settings className="w-4 h-4" />
                <span>Device Settings</span>
              </button>
              <button 
                onClick={fetchDeviceDetails}
                className="w-full bg-accent-blue hover:bg-accent-blue/80 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
              >
                <Activity className="w-4 h-4" />
                <span>Refresh Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* Device Info Footer */}
        <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Device Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-accent-gray">Serial Number:</span>
                <span className="text-white font-mono">{device.deviceSn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-accent-gray">Device Name:</span>
                <span className="text-white">{device.deviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-accent-gray">Type:</span>
                <span className="text-white">{device.deviceType}</span>
              </div>
            </div>
            <div className="space-y-2">
              {device.createdAt && (
                <div className="flex justify-between">
                  <span className="text-accent-gray">Added:</span>
                  <span className="text-white">{new Date(device.createdAt).toLocaleDateString()}</span>
                </div>
              )}
              {device.updatedAt && (
                <div className="flex justify-between">
                  <span className="text-accent-gray">Last Updated:</span>
                  <span className="text-white">{new Date(device.updatedAt).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-accent-gray">Connection:</span>
                <span className={`font-medium ${device.online ? 'text-accent-green' : 'text-red-400'}`}>
                  {device.online ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}