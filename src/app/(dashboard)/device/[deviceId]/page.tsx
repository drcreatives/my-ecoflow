'use client'

import { useEffect, use } from 'react'
import { formatRemainingTime } from '@/lib/data-utils'
import { useRouter } from 'next/navigation'
import { useDeviceStore } from '@/stores/deviceStore'
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
} from 'lucide-react'

interface DevicePageProps {
  params: Promise<{ deviceId: string }>
}

export default function DevicePage({ params }: DevicePageProps) {
  const { deviceId } = use(params)
  const router = useRouter()
  
  // Use Zustand store for device management
  const { devices, isLoading: loading, error, fetchDevices, getDeviceById } = useDeviceStore()
  
  // Get device from store
  const device = getDeviceById(deviceId)

  useEffect(() => {
    // Ensure devices are loaded
    if (devices.length === 0 && !loading) {
      fetchDevices()
    }
  }, [devices.length, loading, fetchDevices])

  const handleBack = () => {
    // Check if there's navigation history
    if (window.history.length > 1) {
      router.back()
    } else {
      // Fallback to devices page if no history
      router.push('/devices')
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status.toLowerCase()) {
      case 'connected':
      case 'online':
        return 'text-brand-primary'
      case 'charging':
        return 'text-brand-tertiary'
      case 'discharging':
        return 'text-warning'
      case 'offline':
      case 'disconnected':
        return 'text-danger'
      default:
        return 'text-text-secondary'
    }
  }

  const getBatteryColor = (level: number): string => {
    if (level > 60) return 'text-brand-primary'
    if (level > 30) return 'text-warning'
    return 'text-danger'
  }

  // Show loading while fetching devices or if device hasn't loaded yet
  if (loading || (devices.length === 0 && !error)) {
    return (
      
        
          <div className="min-h-screen text-text-secondary">
            <div className="container mx-auto px-4 py-8">
              {/* Back button skeleton */}
              <div className="flex items-center space-x-4 mb-8">
                <div className="w-9 h-9 bg-surface-1 rounded-inner animate-pulse"></div>
                <div>
                  <div className="h-8 w-48 bg-surface-1 rounded animate-pulse mb-2"></div>
                  <div className="h-4 w-32 bg-surface-1 rounded animate-pulse"></div>
                </div>
              </div>

              {/* Center loading spinner — removed deprecated tokens */}

              {/* Content skeleton */}
              <div className="space-y-6">
                {/* Analytics card skeleton */}
                <div className="bg-surface-1 rounded-card p-6 animate-pulse">
                  <div className="h-6 w-40 bg-surface-2 rounded mb-2"></div>
                  <div className="h-4 w-64 bg-surface-2 rounded"></div>
                </div>

                {/* Metrics grid skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="bg-surface-1 rounded-card p-6 animate-pulse">
                      <div className="h-6 w-24 bg-surface-2 rounded mb-2"></div>
                      <div className="h-8 w-16 bg-surface-2 rounded"></div>
                    </div>
                  ))}
                </div>

                {/* Large cards skeleton */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="bg-surface-1 rounded-card p-6 animate-pulse">
                      <div className="h-6 w-32 bg-surface-2 rounded mb-4"></div>
                      <div className="space-y-2">
                        <div className="h-4 w-full bg-surface-2 rounded"></div>
                        <div className="h-4 w-3/4 bg-surface-2 rounded"></div>
                        <div className="h-4 w-1/2 bg-surface-2 rounded"></div>
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
      
        
          <div className="min-h-screen text-text-secondary flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-text-primary mb-2">Error Loading Device</h1>
              <p className="text-text-secondary mb-6">{error}</p>
              <button
                onClick={handleBack}
                className="bg-brand-primary hover:bg-brand-primary/80 text-bg-base px-6 py-3 rounded-pill font-medium transition-all duration-160 ease-dashboard"
              >
                Go Back
              </button>
            </div>
          </div>
        
      
    )
  }

  if (!device && devices.length > 0 && !loading) {
    return (
      
        
          <div className="min-h-screen text-text-secondary flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-text-primary mb-2">Device Not Found</h1>
              <p className="text-text-secondary mb-6">The device you&apos;re looking for doesn&apos;t exist.</p>
              <button
                onClick={handleBack}
                className="bg-brand-primary hover:bg-brand-primary/80 text-bg-base px-6 py-3 rounded-pill font-medium transition-all duration-160 ease-dashboard"
              >
                Go Back
              </button>
            </div>
          </div>
        
      
    )
  }

  // Only render content if device is found and loaded
  if (!device) {
    return null // This should not happen due to previous checks, but keeps TypeScript happy
  }

  const reading = device.currentReading

  return (
    
      
        <div className="p-4 sm:p-6 text-text-secondary">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleBack}
                  className="p-2 hover:bg-surface-1 rounded-inner transition-all duration-160 ease-dashboard group"
                  title="Go back"
                >
                  <ArrowLeft className="w-5 h-5 group-hover:text-brand-primary transition-colors" />
                </button>
                <div>
                  <h1 className="text-page-title font-medium text-text-primary">{device.deviceName}</h1>
              <div className="flex items-center space-x-3 mt-1">
                <span className="text-text-secondary text-sm">SN: {device.deviceSn}</span>
                <div className="flex items-center space-x-1">
                  {device.online ? (
                    <Wifi className="w-4 h-4 text-brand-primary" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-danger" />
                  )}
                  <span className={`text-sm font-medium ${device.online ? 'text-brand-primary' : 'text-danger'}`}>
                    {device.online ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <Link
            href={`/device/${device.id}/settings`}
            className="p-2 hover:bg-surface-1 rounded-inner transition-all duration-160 ease-dashboard group"
            title="Device Settings"
          >
            <Settings className="w-6 h-6 group-hover:text-brand-primary transition-colors" />
          </Link>
        </div>

        {/* Analytics Registration Status */}
        <div className="mb-6">
          <div className="bg-surface-1 border border-brand-primary/20 rounded-card shadow-card p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {!device.id.startsWith('temp-') ? (
                  <Activity className="w-5 h-5 text-brand-primary" />
                ) : (
                  <Activity className="w-5 h-5 text-text-muted" />
                )}
                <div>
                  <h3 className={`font-semibold ${!device.id.startsWith('temp-') ? 'text-brand-primary' : 'text-text-muted'}`}>
                    {!device.id.startsWith('temp-') ? 'Analytics Enabled' : 'Analytics Disabled'}
                  </h3>
                  <p className="text-sm text-text-secondary">
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
                    className="px-4 py-2 border border-danger text-danger hover:bg-danger hover:text-text-primary rounded-pill transition-all duration-160 ease-dashboard text-sm font-medium"
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
                    className="px-4 py-2 border border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-bg-base rounded-pill transition-all duration-160 ease-dashboard text-sm font-medium"
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
          <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-4 sm:p-6 hover:border-brand-primary/30 transition-all duration-160 ease-dashboard">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Battery className={`w-5 h-5 ${getBatteryColor(reading?.batteryLevel || 0)}`} />
                <span className="text-text-secondary text-sm font-medium">Battery</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className={`text-2xl font-bold ${getBatteryColor(reading?.batteryLevel || 0)}`}>
                {reading?.batteryLevel || 0}%
              </div>
              <div className="w-full bg-stroke-strong rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all duration-[220ms] ${
                    (reading?.batteryLevel || 0) > 60 ? 'bg-brand-primary' :
                    (reading?.batteryLevel || 0) > 30 ? 'bg-warning' : 'bg-danger'
                  }`}
                  style={{ width: `${reading?.batteryLevel || 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Power Input */}
          <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-4 sm:p-6 hover:border-brand-primary/30 transition-all duration-160 ease-dashboard">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-brand-tertiary" />
                <span className="text-text-secondary text-sm font-medium">Power In</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-brand-tertiary">
              {reading?.inputWatts || 0}W
            </div>
            <div className="text-xs text-text-muted mt-1">
              {(reading?.inputWatts || 0) > 0 ? 'Charging' : 'Not charging'}
            </div>
          </div>

          {/* Power Output */}
          <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-4 sm:p-6 hover:border-brand-primary/30 transition-all duration-160 ease-dashboard">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <TrendingDown className="w-5 h-5 text-warning" />
                <span className="text-text-secondary text-sm font-medium">Power Out</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-warning">
              {reading?.outputWatts || 0}W
            </div>
            <div className="text-xs text-text-muted mt-1">
              {(reading?.outputWatts || 0) > 0 ? 'In use' : 'Standby'}
            </div>
          </div>

          {/* Temperature */}
          <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-4 sm:p-6 hover:border-brand-primary/30 transition-all duration-160 ease-dashboard">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Thermometer className="w-5 h-5 text-brand-primary" />
                <span className="text-text-secondary text-sm font-medium">Temperature</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-brand-primary">
              {reading?.temperature || 20}°C
            </div>
            <div className="text-xs text-text-muted mt-1">
              {(reading?.temperature || 20) < 45 ? 'Normal' : 'High'}
            </div>
          </div>
        </div>

        {/* Power Output Breakdown */}
        <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-warning" />
            <h3 className="text-lg font-medium text-text-primary">Power Output Breakdown</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* AC Output */}
            <div className="bg-surface-2 rounded-inner p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-brand-tertiary rounded"></div>
                  <span className="text-sm font-medium text-text-secondary">AC Output</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-brand-tertiary">
                {reading?.acOutputWatts?.toFixed(0) || '0'}W
              </div>
              <div className="text-xs text-text-muted">Alternating Current</div>
            </div>

            {/* DC Output */}
            <div className="bg-surface-2 rounded-inner p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-warning rounded"></div>
                  <span className="text-sm font-medium text-text-secondary">DC Output</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-warning">
                {reading?.dcOutputWatts?.toFixed(0) || '0'}W
              </div>
              <div className="text-xs text-text-muted">Direct Current</div>
            </div>

            {/* USB Output */}
            <div className="bg-surface-2 rounded-inner p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-success rounded"></div>
                  <span className="text-sm font-medium text-text-secondary">USB Output</span>
                </div>
              </div>
              <div className="text-2xl font-bold text-success">
                {reading?.usbOutputWatts?.toFixed(0) || '0'}W
              </div>
              <div className="text-xs text-text-muted">USB Ports</div>
            </div>
          </div>

          {/* Total Power Summary */}
          <div className="bg-surface-2/50 rounded-inner p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">Total Output</span>
              <div className="text-xl font-bold text-text-primary">
                {reading?.outputWatts?.toFixed(0) || '0'}W
              </div>
            </div>
            <div className="text-xs text-text-muted mt-1">
              Combined AC + DC + USB power output
            </div>
          </div>
        </div>

        {/* Additional Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Device Status */}
          <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6">
            <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center space-x-2">
              <Activity className="w-5 h-5 text-brand-primary" />
              <span>Device Status</span>
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Status</span>
                <span className={`font-medium capitalize ${getStatusColor(reading?.status || device.status)}`}>
                  {reading?.status || device.status}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Device Type</span>
                <span className="text-text-primary font-medium">{device.deviceType}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Active</span>
                <span className={`font-medium ${device.isActive ? 'text-brand-primary' : 'text-danger'}`}>
                  {device.isActive ? 'Yes' : 'No'}
                </span>
              </div>
              {reading?.remainingTime && (
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Remaining Time</span>
                  <span className="text-text-primary font-medium flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>{formatRemainingTime(reading.remainingTime)}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6">
            <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center space-x-2">
              <Power className="w-5 h-5 text-brand-primary" />
              <span>Quick Actions</span>
            </h3>
            <div className="space-y-3">
              <button className="w-full bg-brand-primary hover:bg-brand-primary/80 text-bg-base px-4 py-3 rounded-pill font-medium transition-all duration-160 ease-dashboard flex items-center justify-center space-x-2">
                <Zap className="w-4 h-4" />
                <span>Start Charging</span>
              </button>
              <button className="w-full bg-bg-base hover:bg-surface-2 text-text-secondary border border-stroke-subtle hover:border-stroke-strong px-4 py-3 rounded-pill font-medium transition-all duration-160 ease-dashboard flex items-center justify-center space-x-2">
                <Settings className="w-4 h-4" />
                <span>Device Settings</span>
              </button>
              <button 
                onClick={fetchDevices}
                className="w-full bg-brand-tertiary hover:bg-brand-tertiary/80 text-text-primary px-4 py-3 rounded-pill font-medium transition-all duration-160 ease-dashboard flex items-center justify-center space-x-2"
              >
                <Activity className="w-4 h-4" />
                <span>Refresh Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* Device Info Footer */}
        <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6">
          <h3 className="text-lg font-medium text-text-primary mb-4">Device Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-text-secondary">Serial Number:</span>
                <span className="text-text-primary font-mono">{device.deviceSn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Device Name:</span>
                <span className="text-text-primary">{device.deviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Type:</span>
                <span className="text-text-primary">{device.deviceType}</span>
              </div>
            </div>
            <div className="space-y-2">
              {device.createdAt && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Added:</span>
                  <span className="text-text-primary">{new Date(device.createdAt).toLocaleDateString()}</span>
                </div>
              )}
              {device.updatedAt && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Last Updated:</span>
                  <span className="text-text-primary">{new Date(device.updatedAt).toLocaleDateString()}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-secondary">Connection:</span>
                <span className={`font-medium ${device.online ? 'text-brand-primary' : 'text-danger'}`}>
                  {device.online ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>
        </div>
      
    
  )
}