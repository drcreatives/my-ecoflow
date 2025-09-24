'use client'

import { useEffect, useState, use } from 'react'
import { formatRemainingTime } from '@/lib/data-utils'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
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
  AlertTriangle,
  Loader2
} from 'lucide-react'
import { DeviceData } from '@/lib/data-utils'

interface DevicePageProps {
  params: Promise<{ deviceId: string }>
}

export default function DevicePage({ params }: DevicePageProps) {
  const { deviceId } = use(params)
  const router = useRouter()
  const [device, setDevice] = useState<DeviceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDeviceDetails()
  }, [deviceId])

  const handleBack = () => {
    // Check if there's navigation history
    if (window.history.length > 1) {
      router.back()
    } else {
      // Fallback to devices page if no history
      router.push('/devices')
    }
  }

  const fetchDeviceDetails = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/devices')
      if (!response.ok) {
        throw new Error('Failed to fetch devices')
      }
      
      const data: { devices: DeviceData[], total: number } = await response.json()
      const deviceData = data.devices.find(d => d.id === deviceId)
      
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
            <div className="container mx-auto px-4 py-8">
              {/* Back button skeleton */}
              <div className="flex items-center space-x-4 mb-8">
                <div className="w-9 h-9 bg-primary-dark rounded-lg animate-pulse"></div>
                <div>
                  <div className="h-8 w-48 bg-primary-dark rounded animate-pulse mb-2"></div>
                  <div className="h-4 w-32 bg-primary-dark rounded animate-pulse"></div>
                </div>
              </div>

              {/* Center loading spinner */}
              {/* <div className="flex flex-col items-center justify-center py-16">
                <Loader2 size={48} className="animate-spin text-accent-green mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Loading Device Details</h3>
                <p className="text-gray-400">Fetching device information...</p>
              </div> */}

              {/* Content skeleton */}
              <div className="space-y-6">
                {/* Analytics card skeleton */}
                <div className="bg-primary-dark rounded-lg p-6 animate-pulse">
                  <div className="h-6 w-40 bg-gray-800 rounded mb-2"></div>
                  <div className="h-4 w-64 bg-gray-800 rounded"></div>
                </div>

                {/* Metrics grid skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-primary-dark rounded-lg p-6 animate-pulse">
                      <div className="h-6 w-24 bg-gray-800 rounded mb-2"></div>
                      <div className="h-8 w-16 bg-gray-800 rounded"></div>
                    </div>
                  ))}
                </div>

                {/* Large cards skeleton */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="bg-primary-dark rounded-lg p-6 animate-pulse">
                      <div className="h-6 w-32 bg-gray-800 rounded mb-4"></div>
                      <div className="space-y-2">
                        <div className="h-4 w-full bg-gray-800 rounded"></div>
                        <div className="h-4 w-3/4 bg-gray-800 rounded"></div>
                        <div className="h-4 w-1/2 bg-gray-800 rounded"></div>
                      </div>
                    </div>
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
                onClick={handleBack}
                className="bg-accent-green hover:bg-accent-green/80 text-primary-black px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Go Back
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
                onClick={handleBack}
                className="bg-accent-green hover:bg-accent-green/80 text-primary-black px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Go Back
              </button>
            </div>
          </div>
        
      
    )
  }

  const reading = device.currentReading

  return (
    
      
        <div className="min-h-screen bg-primary-black text-accent-gray">
          <div className="container mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleBack}
                  className="p-2 hover:bg-primary-dark rounded-lg transition-colors group"
                  title="Go back"
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
          
          <Link
            href={`/device/${device.id}/settings`}
            className="p-2 hover:bg-primary-dark rounded-lg transition-colors group"
            title="Device Settings"
          >
            <Settings className="w-6 h-6 group-hover:text-accent-green transition-colors" />
          </Link>
        </div>

        {/* Analytics Registration Status */}
        <div className="mb-6">
          <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {!device.id.startsWith('temp-') ? (
                  <Activity className="w-5 h-5 text-accent-green" />
                ) : (
                  <Activity className="w-5 h-5 text-gray-400" />
                )}
                <div>
                  <h3 className={`font-semibold ${!device.id.startsWith('temp-') ? 'text-accent-green' : 'text-gray-400'}`}>
                    {!device.id.startsWith('temp-') ? 'Analytics Enabled' : 'Analytics Disabled'}
                  </h3>
                  <p className="text-sm text-accent-gray">
                    {!device.id.startsWith('temp-') 
                      ? 'This device is registered for data collection, analytics, and history tracking.' 
                      : 'Register this device to enable data collection, analytics, and history tracking.'
                    }
                  </p>
                </div>
              </div>
              
              <div className="ml-4">
                {!device.id.startsWith('temp-') ? (
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to disable analytics for this device? This will stop data collection and remove historical data.')) {
                        fetch('/api/unregister-device', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ deviceSn: device.deviceSn, userId: device.userId })
                        }).then(() => window.location.reload())
                      }
                    }}
                    className="px-4 py-2 border border-red-400 text-red-400 hover:bg-red-400 hover:text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Disable Analytics
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      fetch('/api/register-device', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ deviceSn: device.deviceSn, userId: device.userId })
                      }).then(() => window.location.reload())
                    }}
                    className="px-4 py-2 border border-accent-green text-accent-green hover:bg-accent-green hover:text-black rounded-lg transition-colors text-sm font-medium"
                  >
                    Enable Analytics
                  </button>
                )}
              </div>
            </div>
          </div>
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

        {/* Power Output Breakdown */}
        <div className="bg-primary-dark border border-gray-700 rounded-lg p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-yellow-400" />
            <h3 className="text-lg font-semibold text-white">Power Output Breakdown</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* AC Output */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded"></div>
                  <span className="text-sm font-medium text-gray-300">AC Output</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-blue-400">
                {reading?.acOutputWatts?.toFixed(0) || '0'}W
              </div>
              <div className="text-xs text-gray-500">Alternating Current</div>
            </div>

            {/* DC Output */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                  <span className="text-sm font-medium text-gray-300">DC Output</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-yellow-400">
                {reading?.dcOutputWatts?.toFixed(0) || '0'}W
              </div>
              <div className="text-xs text-gray-500">Direct Current</div>
            </div>

            {/* USB Output */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded"></div>
                  <span className="text-sm font-medium text-gray-300">USB Output</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-green-400">
                {reading?.usbOutputWatts?.toFixed(0) || '0'}W
              </div>
              <div className="text-xs text-gray-500">USB Ports</div>
            </div>
          </div>

          {/* Total Power Summary */}
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">Total Output</span>
              <div className="text-xl font-bold text-white">
                {reading?.outputWatts?.toFixed(0) || '0'}W
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Combined AC + DC + USB power output
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