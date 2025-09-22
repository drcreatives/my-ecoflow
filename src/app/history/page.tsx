'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Calendar,
  Download,
  Filter,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Clock,
  Battery,
  Zap,
  Thermometer,
  Activity,
  RefreshCw,
  Loader2,
  ChevronDown,
  ExternalLink,
  AlertTriangle
} from 'lucide-react'
import { AppLayout } from '@/components/layout'
import AuthWrapper from '@/components/AuthWrapper'
import { useDeviceStore } from '@/stores/deviceStore'
import { DeviceReading } from '@/lib/data-utils'
import { cn } from '@/lib/utils'

// Types for history data
interface HistoryFilters {
  deviceId: string | 'all'
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d' | 'custom'
  customStartDate?: string
  customEndDate?: string
  aggregation: 'raw' | '5m' | '1h' | '1d'
}

interface HistorySummary {
  totalReadings: number
  avgBatteryLevel: number
  avgPowerOutput: number
  avgTemperature: number
  peakPowerOutput: number
  lowestBatteryLevel: number
  highestTemperature: number
  timeSpan: string
}

interface DeviceOption {
  id: string
  name: string
  sn: string
  isActive: boolean
}

function HistoryPage() {
  const { devices, fetchDevices, isLoading: devicesLoading } = useDeviceStore()
  const [readings, setReadings] = useState<DeviceReading[]>([])
  const [summary, setSummary] = useState<HistorySummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Filter state
  const [filters, setFilters] = useState<HistoryFilters>({
    deviceId: 'all',
    timeRange: '24h',
    aggregation: '1h'
  })

  // UI state
  const [showFilters, setShowFilters] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Device options for dropdown
  const deviceOptions: DeviceOption[] = [
    { id: 'all', name: 'All Devices', sn: '', isActive: true },
    ...devices.map(device => ({
      id: device.id,
      name: device.deviceName || `Device ${device.deviceSn}`,
      sn: device.deviceSn,
      isActive: !device.id.startsWith('temp-')
    }))
  ]

  const selectedDevice = deviceOptions.find(d => d.id === filters.deviceId)

  // Pagination calculations
  const totalPages = Math.ceil(readings.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedReadings = readings.slice(startIndex, endIndex)

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  // Fetch devices on mount
  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  // Fetch history data when filters change
  useEffect(() => {
    if (devices.length > 0) {
      fetchHistoryData()
    }
  }, [filters, devices])

  const fetchHistoryData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Build query parameters
      const params = new URLSearchParams({
        timeRange: filters.timeRange,
        aggregation: filters.aggregation
      })

      if (filters.deviceId !== 'all') {
        params.append('deviceId', filters.deviceId)
      }

      if (filters.customStartDate) {
        params.append('startDate', filters.customStartDate)
      }

      if (filters.customEndDate) {
        params.append('endDate', filters.customEndDate)
      }

      // Fetch data from API
      const response = await fetch(`/api/history/readings?${params.toString()}`, {
        credentials: 'include'
      })
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch history data')
      }

      // Transform API response to local format
      const apiReadings = data.data.readings.map((reading: any) => ({
        ...reading,
        recordedAt: new Date(reading.recordedAt)
      }))

      setReadings(apiReadings)
      setSummary(data.data.summary)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error fetching history data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load historical data')
      
      // For debugging: Log the exact error details
      console.log('API Response Error Details:', {
        error: err,
        deviceId: filters.deviceId,
        timeRange: filters.timeRange,
        aggregation: filters.aggregation
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Mock data generator (will be replaced with API call)
  const generateMockHistoryData = (): DeviceReading[] => {
    const now = new Date()
    const readings: DeviceReading[] = []
    const hoursBack = filters.timeRange === '1h' ? 1 : 
                     filters.timeRange === '6h' ? 6 :
                     filters.timeRange === '24h' ? 24 :
                     filters.timeRange === '7d' ? 168 :
                     filters.timeRange === '30d' ? 720 : 24

    for (let i = hoursBack; i >= 0; i--) {
      const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000)
      const totalOutput = Math.max(0, 300 + Math.cos(i / 8) * 200)
      const acOutput = Math.max(0, totalOutput * 0.6) // 60% AC
      const dcOutput = Math.max(0, totalOutput * 0.3) // 30% DC  
      const usbOutput = Math.max(0, totalOutput * 0.1) // 10% USB
      
      readings.push({
        id: `reading-${i}`,
        deviceId: devices[0]?.id || 'mock-device',
        batteryLevel: Math.max(20, Math.min(100, 80 + Math.sin(i / 10) * 20)),
        inputWatts: Math.max(0, 200 + Math.sin(i / 5) * 150),
        outputWatts: totalOutput,
        acOutputWatts: acOutput,
        dcOutputWatts: dcOutput,
        usbOutputWatts: usbOutput,
        temperature: 25 + Math.sin(i / 12) * 8,
        remainingTime: Math.floor(Math.random() * 600) + 120,
        status: 'normal',
        recordedAt: timestamp
      })
    }

    return readings.reverse()
  }

  const calculateSummary = (data: DeviceReading[]): HistorySummary => {
    if (data.length === 0) {
      return {
        totalReadings: 0,
        avgBatteryLevel: 0,
        avgPowerOutput: 0,
        avgTemperature: 0,
        peakPowerOutput: 0,
        lowestBatteryLevel: 0,
        highestTemperature: 0,
        timeSpan: '0 hours'
      }
    }

    const batteryLevels = data.map(r => r.batteryLevel).filter((level): level is number => level !== null && level !== undefined && !isNaN(level))
    const powerOutputs = data.map(r => r.outputWatts).filter((watts): watts is number => watts !== null && watts !== undefined && !isNaN(watts))
    const temperatures = data.map(r => r.temperature).filter((temp): temp is number => temp !== null && temp !== undefined && !isNaN(temp))

    const startTime = new Date(data[0].recordedAt)
    const endTime = new Date(data[data.length - 1].recordedAt)
    const timeDiff = endTime.getTime() - startTime.getTime()
    const hoursDiff = Math.round(timeDiff / (1000 * 60 * 60))

    return {
      totalReadings: data.length,
      avgBatteryLevel: batteryLevels.length > 0 ? batteryLevels.reduce((a, b) => a + b, 0) / batteryLevels.length : 0,
      avgPowerOutput: powerOutputs.length > 0 ? powerOutputs.reduce((a, b) => a + b, 0) / powerOutputs.length : 0,
      avgTemperature: temperatures.length > 0 ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length : 0,
      peakPowerOutput: powerOutputs.length > 0 ? Math.max(...powerOutputs) : 0,
      lowestBatteryLevel: batteryLevels.length > 0 ? Math.min(...batteryLevels) : 0,
      highestTemperature: temperatures.length > 0 ? Math.max(...temperatures) : 0,
      timeSpan: hoursDiff >= 24 ? `${Math.round(hoursDiff / 24)} days` : `${hoursDiff} hours`
    }
  }

  const handleExportData = async () => {
    try {
      setIsExporting(true)
      
      // Use the API endpoint for export
      const response = await fetch('/api/history/readings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          format: 'csv',
          filters: {
            deviceId: filters.deviceId,
            timeRange: filters.timeRange,
            aggregation: filters.aggregation,
            startDate: filters.customStartDate,
            endDate: filters.customEndDate
          }
        })
      })

      if (!response.ok) {
        throw new Error('Export failed')
      }

      // Handle CSV download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      const deviceName = selectedDevice?.name || 'All-Devices'
      const timeRange = filters.timeRange
      const timestamp = new Date().toISOString().split('T')[0]
      
      link.download = `ecoflow-history-${deviceName}-${timeRange}-${timestamp}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      setError('Failed to export data')
      
        // Fallback to client-side export for development
        console.log('Falling back to client-side export')
        try {
          const csvHeaders = ['Timestamp', 'Device ID', 'Battery %', 'Input (W)', 'Output (W)', 'Temperature (°C)', 'Status']
          const csvData = readings.map(reading => [
            reading.recordedAt.toISOString(),
            reading.deviceId,
            reading.batteryLevel?.toString() || '0',
            reading.inputWatts?.toString() || '0',
            reading.outputWatts?.toString() || '0',
            reading.temperature?.toString() || '0',
            reading.status || 'unknown'
          ])

          const csvContent = [csvHeaders, ...csvData]
            .map(row => row.join(','))
            .join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        
        const deviceName = selectedDevice?.name || 'All-Devices'
        const timeRange = filters.timeRange
        const timestamp = new Date().toISOString().split('T')[0]
        
        link.download = `ecoflow-history-${deviceName}-${timeRange}-${timestamp}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)
      } catch (fallbackErr) {
        console.error('Fallback export also failed:', fallbackErr)
      }
    } finally {
      setIsExporting(false)
    }
  }

  const getTimeRangeLabel = (range: string) => {
    switch (range) {
      case '1h': return 'Last Hour'
      case '6h': return 'Last 6 Hours'
      case '24h': return 'Last 24 Hours'
      case '7d': return 'Last 7 Days'
      case '30d': return 'Last 30 Days'
      case 'custom': return 'Custom Range'
      default: return 'Last 24 Hours'
    }
  }

  const formatValue = (value: number | null | undefined, unit: string) => {
    if (value === null || value === undefined || isNaN(value)) return '0' + unit
    return value.toFixed(1) + unit
  }

  if (devicesLoading) {
    return (
      <AppLayout>
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-accent-green animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Loading devices...</p>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-accent-green">
                  <BarChart3 size={28} />
                  <h1 className="text-2xl sm:text-3xl font-bold">Historical Data</h1>
                </div>
              </div>
              <p className="text-gray-400">
                Detailed device readings and power consumption data
              </p>
              {lastUpdated && (
                <p className="text-xs text-gray-500">
                  Last updated: {lastUpdated.toLocaleString()}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors",
                  showFilters 
                    ? "bg-accent-green text-black border-accent-green" 
                    : "bg-primary-dark text-gray-300 border-gray-600 hover:border-gray-500"
                )}
              >
                <Filter size={16} />
                Filters
              </button>
              
              <button
                onClick={handleExportData}
                disabled={isExporting || readings.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {isExporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                Export CSV
              </button>

              <button
                onClick={fetchHistoryData}
                disabled={isLoading}
                className="flex items-center gap-2 px-4 py-2 bg-primary-dark border border-gray-600 hover:border-gray-500 text-gray-300 rounded-lg transition-colors"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="bg-primary-dark border border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Data Filters</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Device Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Device
                  </label>
                  <div className="relative">
                    <select
                      value={filters.deviceId}
                      onChange={(e) => setFilters(prev => ({ ...prev, deviceId: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green appearance-none pr-10"
                    >
                      {deviceOptions.map(device => (
                        <option key={device.id} value={device.id}>
                          {device.name} {device.sn && `(${device.sn})`}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                  </div>
                </div>

                {/* Time Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Time Range
                  </label>
                  <div className="relative">
                    <select
                      value={filters.timeRange}
                      onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as any }))}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green appearance-none pr-10"
                    >
                      <option value="1h">Last Hour</option>
                      <option value="6h">Last 6 Hours</option>
                      <option value="24h">Last 24 Hours</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                      <option value="custom">Custom Range</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                  </div>
                </div>

                {/* Data Aggregation */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Data Points
                  </label>
                  <div className="relative">
                    <select
                      value={filters.aggregation}
                      onChange={(e) => setFilters(prev => ({ ...prev, aggregation: e.target.value as any }))}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green appearance-none pr-10"
                    >
                      <option value="raw">Raw Data</option>
                      <option value="5m">5 Minute Average</option>
                      <option value="1h">Hourly Average</option>
                      <option value="1d">Daily Average</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
                  </div>
                </div>
              </div>

              {filters.timeRange === 'custom' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Start Date
                    </label>
                    <input
                      type="datetime-local"
                      value={filters.customStartDate || ''}
                      onChange={(e) => setFilters(prev => ({ ...prev, customStartDate: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      End Date
                    </label>
                    <input
                      type="datetime-local"
                      value={filters.customEndDate || ''}
                      onChange={(e) => setFilters(prev => ({ ...prev, customEndDate: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-accent-green"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-400">
                <AlertTriangle size={16} />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-red-300 mt-1">{error}</p>
            </div>
          )}

          {/* Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-primary-dark border border-blue-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  <span className="text-xs text-gray-400">{summary.timeSpan || '0 hours'}</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {(summary.totalReadings || 0).toLocaleString()}
                </div>
                <div className="text-sm text-gray-400">Data Points</div>
              </div>

              <div className="bg-primary-dark border border-green-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Battery className="w-5 h-5 text-green-400" />
                  <span className="text-xs text-gray-400">Average</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {formatValue(summary.avgBatteryLevel, '%')}
                </div>
                <div className="text-sm text-gray-400">Battery Level</div>
              </div>

              <div className="bg-primary-dark border border-yellow-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <span className="text-xs text-gray-400">Peak: {formatValue(summary.peakPowerOutput, 'W')}</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {formatValue(summary.avgPowerOutput, 'W')}
                </div>
                <div className="text-sm text-gray-400">Avg Power Output</div>
              </div>

              <div className="bg-primary-dark border border-red-500/20 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Thermometer className="w-5 h-5 text-red-400" />
                  <span className="text-xs text-gray-400">Max: {formatValue(summary.highestTemperature, '°C')}</span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {formatValue(summary.avgTemperature, '°C')}
                </div>
                <div className="text-sm text-gray-400">Avg Temperature</div>
              </div>
            </div>
          )}

          {/* Data Table Section */}
          <div className="bg-primary-dark border border-gray-700 rounded-lg">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">Device Readings History</h3>
                <div className="text-sm text-gray-400">
                  Showing {getTimeRangeLabel(filters.timeRange)} • {selectedDevice?.name}
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-accent-green animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Loading historical data...</p>
                </div>
              </div>
            ) : readings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                <BarChart3 className="w-16 h-16 text-gray-600 mb-4" />
                <h3 className="text-lg font-semibold text-gray-400 mb-2">No Historical Data</h3>
                <p className="text-gray-500 mb-4">
                  No data available for the selected device and time range.
                </p>
                <Link
                  href="/devices"
                  className="flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 text-black font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  <ExternalLink size={16} />
                  Manage Devices
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">Timestamp</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">Device</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">Battery</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">Input Power</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">Output Power</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">AC Output</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">DC Output</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">USB Output</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">Temperature</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-300">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {paginatedReadings.map((reading, index) => {
                      const device = devices.find(d => d.id === reading.deviceId)
                      return (
                        <tr key={reading.id || index} className="hover:bg-gray-800/30 transition-colors">
                          <td className="p-4 text-sm text-gray-300">
                            {reading.recordedAt.toLocaleString()}
                          </td>
                          <td className="p-4 text-sm text-gray-300">
                            <div className="flex flex-col">
                              <span className="font-medium">{device?.deviceName || 'Unknown Device'}</span>
                              <span className="text-xs text-gray-500">{device?.deviceSn || reading.deviceId}</span>
                            </div>
                          </td>
                          <td className="p-4 text-sm">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${
                                (reading.batteryLevel && typeof reading.batteryLevel === 'number' && reading.batteryLevel > 50) ? 'bg-green-400' :
                                (reading.batteryLevel && typeof reading.batteryLevel === 'number' && reading.batteryLevel > 20) ? 'bg-yellow-400' : 'bg-red-400'
                              }`} />
                              <span className="text-white font-medium">
                                {reading.batteryLevel && typeof reading.batteryLevel === 'number' ? reading.batteryLevel.toFixed(1) : '0'}%
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-sm text-purple-400 font-medium">
                            {reading.inputWatts && typeof reading.inputWatts === 'number' ? reading.inputWatts.toFixed(0) : '0'}W
                          </td>
                          <td className="p-4 text-sm text-yellow-400 font-medium">
                            {reading.outputWatts && typeof reading.outputWatts === 'number' ? reading.outputWatts.toFixed(0) : '0'}W
                          </td>
                          <td className="p-4 text-sm text-blue-400 font-medium">
                            {reading.acOutputWatts && typeof reading.acOutputWatts === 'number' ? reading.acOutputWatts.toFixed(0) : '0'}W
                          </td>
                          <td className="p-4 text-sm text-orange-400 font-medium">
                            {reading.dcOutputWatts && typeof reading.dcOutputWatts === 'number' ? reading.dcOutputWatts.toFixed(0) : '0'}W
                          </td>
                          <td className="p-4 text-sm text-green-400 font-medium">
                            {reading.usbOutputWatts && typeof reading.usbOutputWatts === 'number' ? reading.usbOutputWatts.toFixed(0) : '0'}W
                          </td>
                          <td className="p-4 text-sm text-red-400 font-medium">
                            {reading.temperature && typeof reading.temperature === 'number' ? reading.temperature.toFixed(1) : '0'}°C
                          </td>
                          <td className="p-4 text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              reading.status === 'normal' ? 'bg-green-900/50 text-green-300' :
                              reading.status === 'charging' ? 'bg-blue-900/50 text-blue-300' :
                              reading.status === 'discharging' ? 'bg-yellow-900/50 text-yellow-300' :
                              'bg-gray-900/50 text-gray-300'
                            }`}>
                              {reading.status || 'unknown'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {readings.length > 0 && (
              <div className="p-4 border-t border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-gray-400">
                  Showing {startIndex + 1}-{Math.min(endIndex, readings.length)} of {readings.length} readings
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  
                  {/* Page Numbers */}
                  <div className="flex items-center gap-1">
                    {/* First page */}
                    {currentPage > 3 && (
                      <>
                        <button
                          onClick={() => setCurrentPage(1)}
                          className="w-8 h-8 flex items-center justify-center text-sm text-gray-300 hover:bg-gray-700 rounded border border-gray-600 transition-colors"
                        >
                          1
                        </button>
                        {currentPage > 4 && <span className="text-gray-500 px-1">...</span>}
                      </>
                    )}
                    
                    {/* Current page and neighbors */}
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i
                      if (pageNum > totalPages) return null
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 flex items-center justify-center text-sm rounded border transition-colors ${
                            pageNum === currentPage
                              ? 'bg-accent-green text-black border-accent-green'
                              : 'text-gray-300 hover:bg-gray-700 border-gray-600'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    
                    {/* Last page */}
                    {currentPage < totalPages - 2 && (
                      <>
                        {currentPage < totalPages - 3 && <span className="text-gray-500 px-1">...</span>}
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className="w-8 h-8 flex items-center justify-center text-sm text-gray-300 hover:bg-gray-700 rounded border border-gray-600 transition-colors"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* No Devices State */}
          {devices.length === 0 && (
            <div className="bg-primary-dark border border-gray-700 rounded-lg p-8 text-center">
              <Battery className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">No Devices Found</h3>
              <p className="text-gray-500 mb-6">
                You need to add and register devices before viewing historical data.
              </p>
              <Link
                href="/devices/add"
                className="inline-flex items-center gap-2 bg-accent-green hover:bg-accent-green/90 text-black font-medium py-3 px-6 rounded-lg transition-colors"
              >
                <ExternalLink size={16} />
                Add Your First Device
              </Link>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

// Wrap with authentication
export default function HistoryPageWrapper() {
  return (
    <AuthWrapper>
      <HistoryPage />
    </AuthWrapper>
  )
}