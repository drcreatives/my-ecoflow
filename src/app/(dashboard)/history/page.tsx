'use client'

import { TEMPERATURE_FEATURE_ENABLED } from '@/lib/features'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { 
  Download,
  Filter,
  BarChart3,
  Battery,
  Zap,
  Thermometer,
  Activity,
  RefreshCw,
  Loader2,
  ChevronDown,
  ExternalLink,
  AlertTriangle,
  Search
} from 'lucide-react'
import { useConvexDevices, useConvexHistoryReadings } from '@/hooks/useConvexData'
import { cn } from '@/lib/utils'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
import { createHistoryCsv } from '@/lib/history-export'
import { formatMeasurementValue as formatValue } from '@/lib/data-utils'
import { getInputSourceDescription, getVerifiedSolarPanelInput } from '@/lib/reading-status'
import { mergeTemperatureHistoryReadings } from '@/lib/temperature-history'

// Types for history data
interface HistoryFilters {
  deviceId: string | 'all'
  timeRange: '1h' | '6h' | '24h' | '7d' | '30d' | 'custom'
  customStartDate?: string
  customEndDate?: string
  aggregation: 'raw' | '5m' | '1h' | '1d'
}

function formatTimeSpan(startTime: number, endTime: number): string {
  const diffMs = endTime - startTime;
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours} hours`;
  const mins = Math.floor(diffMs / (1000 * 60));
  return `${mins} minutes`;
}

interface HistorySummary {
  totalReadings: number
  avgBatteryLevel: number
  avgPowerOutput: number
  avgTemperature: number | null
  temperatureReadings: number
  peakPowerOutput: number
  lowestBatteryLevel: number
  highestTemperature: number | null
  startTime: number
  endTime: number
}

interface DeviceOption {
  id: string
  name: string
  sn: string
  isActive: boolean
}

function HistoryPage() {
  // Use Convex reactive queries — no manual fetch needed
  const { devices, isLoading: devicesLoading } = useConvexDevices()

  // Filter state
  const [filters, setFilters] = useState<HistoryFilters>({
    deviceId: 'all',
    timeRange: '24h',
    aggregation: '1h'
  })

  // UI state
  const [showFilters, setShowFilters] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  // Pagination state - now managed by readings store
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

  // Set default device when devices are loaded
  useEffect(() => {
    if (devices.length > 0 && filters.deviceId === 'all') {
      const firstDevice = devices[0]
      setFilters(prev => ({
        ...prev,
        deviceId: firstDevice.id
      }))
    }
  }, [devices, filters.deviceId])

  // ─── Convex reactive query for history data ───────────────────────────
  // Only query when we have a valid device (not 'all') and either a preset
  // range or both custom dates are filled in.
  const shouldQuery =
    filters.deviceId !== 'all' &&
    (filters.timeRange !== 'custom' ||
      (!!filters.customStartDate && !!filters.customEndDate))

  const {
    readings,
    summary,
    samplingIntervalMs,
    temperatureReadings,
    temperatureSamplingIntervalMs,
    temperatureSampledReadings,
    temperatureSummary,
    isLoading,
    error,
  } = useConvexHistoryReadings(
    shouldQuery ? filters.deviceId : null,
    {
      timeRange: filters.timeRange !== 'custom' ? filters.timeRange : undefined,
      customStartDate: filters.customStartDate,
      customEndDate: filters.customEndDate,
      aggregation: filters.aggregation,
    }
  )

  const mergedReadings = useMemo(() => TEMPERATURE_FEATURE_ENABLED ? mergeTemperatureHistoryReadings(readings, temperatureReadings) : readings, [readings, temperatureReadings])
  // Reverse the combined display rows; power calculations continue to use the original stream.
  const tableReadings = useMemo(() => [...mergedReadings].reverse(), [mergedReadings])
  const lastRecordedAt = mergedReadings.reduce((latest, reading) => Math.max(latest, new Date(reading.recordedAt).getTime()), 0)
  const temperatureStats = temperatureSummary ?? (summary ? {
    avgTemperature: summary.avgTemperature, maxTemperature: summary.highestTemperature,
  } : null)

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(tableReadings.length / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedReadings = tableReadings.slice(startIndex, endIndex)

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  const handleExportData = async () => {
    try {
      setIsExporting(true)
      // Client-side CSV export from current readings
      if (mergedReadings.length === 0) throw new Error('No data to export')
      const csv = createHistoryCsv(mergedReadings)
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ecoflow-history-${new Date().toISOString().slice(0,10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      alert(err instanceof Error ? err.message : 'Failed to export data')
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

  const getAggregationLabel = (aggregation: HistoryFilters['aggregation']) => {
    switch (aggregation) {
      case 'raw':
        return samplingIntervalMs || (TEMPERATURE_FEATURE_ENABLED && temperatureSamplingIntervalMs) ? 'Raw Data (sampled)' : 'Raw Data'
      case '5m':
        return '5 Minute Avg'
      case '1h':
        return 'Hourly Avg'
      case '1d':
        return 'Daily Avg'
      default:
        return 'Raw Data'
    }
  }

  if (devicesLoading) {
    return (
      
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto mb-4" />
              <p className="text-text-secondary">Loading devices...</p>
            </div>
          </div>
        </div>
      
    )
  }

  return (
    
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-brand-primary">
                  <BarChart3 size={28} />
                  <h1 className="text-page-title text-text-primary font-medium">Historical Data</h1>
                </div>
              </div>
              <p className="text-text-secondary">
                Detailed device readings and power consumption data
              </p>
              {lastRecordedAt > 0 && (
                <p className="text-xs text-text-muted">
                  Latest history point: {new Date(lastRecordedAt).toLocaleString()}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-pill border transition-all duration-160 text-sm",
                  showFilters 
                    ? "bg-brand-primary text-bg-base border-brand-primary" 
                    : "bg-surface-2 text-text-secondary border-stroke-subtle hover:border-stroke-strong"
                )}
              >
                <Filter size={16} />
                Filters
              </button>
              
              <button
                onClick={handleExportData}
                disabled={isExporting || mergedReadings.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-brand-tertiary hover:bg-brand-tertiary/90 disabled:bg-surface-2 disabled:opacity-50 text-bg-base rounded-pill transition-all duration-160 text-sm"
              >
                {isExporting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                Export CSV
              </button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
              <h3 className="text-section-title font-medium text-text-primary mb-4">Data Filters</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Device Selection */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Device
                  </label>
                  <div className="relative">
                    <select
                      value={filters.deviceId}
                      onChange={(e) => setFilters(prev => ({ ...prev, deviceId: e.target.value }))}
                      className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 appearance-none pr-10"
                    >
                      {deviceOptions.map(device => (
                        <option key={device.id} value={device.id}>
                          {device.name} {device.sn && `(${device.sn})`}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
                  </div>
                </div>

                {/* Time Range */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Time Range
                  </label>
                  <div className="relative">
                    <select
                      value={filters.timeRange}
                      onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as HistoryFilters['timeRange'] }))}
                      className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 appearance-none pr-10"
                    >
                      <option value="1h">Last Hour</option>
                      <option value="6h">Last 6 Hours</option>
                      <option value="24h">Last 24 Hours</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                      <option value="custom">Custom Range</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
                  </div>
                </div>

                {/* Data Aggregation */}
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Data Points
                  </label>
                  <div className="relative">
                    <select
                      value={filters.aggregation}
                      onChange={(e) => setFilters(prev => ({ ...prev, aggregation: e.target.value as any }))}
                      className="w-full bg-surface-2 border border-stroke-subtle rounded-inner px-3 py-2 text-text-primary focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/40 appearance-none pr-10"
                    >
                      <option value="raw">Raw Data</option>
                      <option value="5m">5 Minute Average</option>
                      <option value="1h">Hourly Average</option>
                      <option value="1d">Daily Average</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
                  </div>
                </div>
              </div>

              {filters.timeRange === 'custom' && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Start Date
                      </label>
                      <DateTimePicker
                        value={filters.customStartDate || ''}
                        onChange={(val) => setFilters(prev => ({ ...prev, customStartDate: val }))}
                        placeholder="Select start date & time"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        End Date
                      </label>
                      <DateTimePicker
                        value={filters.customEndDate || ''}
                        onChange={(val) => setFilters(prev => ({ ...prev, customEndDate: val }))}
                        placeholder="Select end date & time"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        // Setting filter state triggers the reactive query automatically
                        setFilters(prev => ({ ...prev }))
                      }}
                      disabled={!filters.customStartDate || !filters.customEndDate}
                      className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-bg-base rounded-pill text-sm font-medium hover:brightness-110 transition-all duration-160 ease-dashboard disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Search size={14} />
                      Apply Custom Range
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-danger/5 border border-danger/15 rounded-card p-4">
              <div className="flex items-center gap-2 text-danger">
                <AlertTriangle size={16} />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-danger/80 mt-1">{error}</p>
            </div>
          )}

          {samplingIntervalMs !== null && samplingIntervalMs > 0 && (
            <p className="text-xs text-text-muted" role="note">
              Sampled history: approximately one reading per {(samplingIntervalMs / 60_000).toFixed(1)} minutes before averaging.
              {' '}Summaries and this CSV cover the displayed sample, not every stored reading.
            </p>
          )}

          {/* Summary Cards */}
          {(summary || (TEMPERATURE_FEATURE_ENABLED && temperatureSummary)) && (
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${TEMPERATURE_FEATURE_ENABLED ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-[18px]`}>
              <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
                <div className="flex items-center justify-between mb-2">
                  <Activity className="w-5 h-5 text-brand-tertiary" />
                  <span className="text-xs text-text-muted">{summary ? formatTimeSpan(summary.startTime, summary.endTime) : 'Temperature observations'}</span>
                </div>
                <div className="text-2xl font-medium text-text-primary mb-1">
                  {mergedReadings.length.toLocaleString()}
                </div>
                <div className="text-sm text-text-secondary">Data Points</div>
              </div>

              <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
                <div className="flex items-center justify-between mb-2">
                  <Battery className="w-5 h-5 text-brand-primary" />
                  <span className="text-xs text-text-muted">Average</span>
                </div>
                <div className="text-2xl font-medium text-text-primary mb-1">
                  {formatValue(readings.length ? summary?.avgBatteryLevel : null, '%')}
                </div>
                <div className="text-sm text-text-secondary">Battery Level</div>
              </div>

              <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
                <div className="flex items-center justify-between mb-2">
                  <Zap className="w-5 h-5 text-warning" />
                  <span className="text-xs text-text-muted">Peak: {formatValue(readings.length ? summary?.peakPowerOutput : null, 'W')}</span>
                </div>
                <div className="text-2xl font-medium text-text-primary mb-1">
                  {formatValue(readings.length ? summary?.avgPowerOutput : null, 'W')}
                </div>
                <div className="text-sm text-text-secondary">Avg Power Output</div>
              </div>

              {TEMPERATURE_FEATURE_ENABLED && (<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-[18px]">
                <div className="flex items-center justify-between mb-2">
                  <Thermometer className="w-5 h-5 text-danger" />
                  <span className="text-xs text-text-muted">Max: {formatValue(temperatureStats?.maxTemperature, '°C')}</span>
                </div>
                <div className="text-2xl font-medium text-text-primary mb-1">
                  {formatValue(temperatureStats?.avgTemperature, '°C')}
                </div>
                <div className="text-sm text-text-secondary">Avg Temperature</div>
                <div className="text-xs text-text-muted mt-1">
                  {(temperatureSampledReadings ?? 0).toLocaleString()} temperature readings{temperatureSamplingIntervalMs ? ' (sampled)' : ''}
                </div>
              </div>)}
            </div>
          )}

          {/* Data Table Section */}
          <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card">
            <div className="p-[18px] border-b border-stroke-subtle">
              <div className="flex items-center justify-between">
                <h3 className="text-section-title font-medium text-text-primary">Device Readings History</h3>
                <div className="text-sm text-text-muted">
                  Showing {getTimeRangeLabel(filters.timeRange)} • {getAggregationLabel(filters.aggregation)} • {selectedDevice?.name}
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto mb-4" />
                  <p className="text-text-secondary">Loading historical data...</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                <AlertTriangle className="w-16 h-16 text-danger mb-4" />
                <h3 className="text-lg font-medium text-text-secondary mb-2">Error Loading Data</h3>
                <p className="text-text-muted mb-4">
                  {error}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="flex items-center gap-2 bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160 text-sm"
                >
                  <RefreshCw size={16} />
                  Retry
                </button>
              </div>
            ) : tableReadings.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                <BarChart3 className="w-16 h-16 text-text-muted mb-4" />
                <h3 className="text-lg font-medium text-text-secondary mb-2">No Historical Data</h3>
                <p className="text-text-muted mb-4">
                  No data available for the selected device and time range.
                </p>
                <Link
                  href="/devices"
                  className="flex items-center gap-2 bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-2 px-4 rounded-pill transition-all duration-160 text-sm"
                >
                  <ExternalLink size={16} />
                  Manage Devices
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-2">
                    <tr>
                      <th className="text-left p-4 text-sm font-medium text-text-secondary">Timestamp</th>
                      <th className="text-left p-4 text-sm font-medium text-text-secondary">Device</th>
                      <th className="text-left p-4 text-sm font-medium text-text-secondary">Battery</th>
                      <th className="text-left p-4 text-sm font-medium text-text-secondary">Input Power</th>
                      <th className="text-left p-4 text-sm font-medium text-text-secondary">Output Power</th>
                      <th className="text-left p-4 text-sm font-medium text-text-secondary">AC Output</th>
                      <th className="text-left p-4 text-sm font-medium text-text-secondary">DC Output</th>
                      <th className="text-left p-4 text-sm font-medium text-text-secondary">USB Output</th>
                      {TEMPERATURE_FEATURE_ENABLED && (<th className="text-left p-4 text-sm font-medium text-text-secondary">Temperature</th>)}
                      <th className="text-left p-4 text-sm font-medium text-text-secondary">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stroke-subtle">
                    {paginatedReadings.map((reading, index) => {
                      const device = devices.find(d => d.id === reading.deviceId)
                      const panels = filters.aggregation === 'raw' ? getVerifiedSolarPanelInput(reading) : null
                      return (
                        <tr key={index} className="hover:bg-surface-2/50 transition-colors">
                          <td className="p-4 text-sm text-text-secondary">
                            {new Date(reading.recordedAt).toLocaleString()}
                          </td>
                          <td className="p-4 text-sm text-text-secondary">
                            <div className="flex flex-col">
                              <span className="font-medium text-text-primary">{device?.deviceName || 'Unknown Device'}</span>
                              <span className="text-xs text-text-muted">{device?.deviceSn || reading.deviceId}</span>
                            </div>
                          </td>
                          <td className="p-4 text-sm">
                            <div className="flex items-center gap-2">
                              {typeof reading.batteryLevel === 'number' && Number.isFinite(reading.batteryLevel) && <div className={`w-2 h-2 rounded-full ${
                                (reading.batteryLevel && typeof reading.batteryLevel === 'number' && reading.batteryLevel > 50) ? 'bg-brand-primary' :
                                (reading.batteryLevel && typeof reading.batteryLevel === 'number' && reading.batteryLevel > 20) ? 'bg-warning' : 'bg-danger'
                              }`} />}
                              <span className="text-text-primary font-medium">
                                {formatValue(reading.batteryLevel, '%')}
                              </span>
                            </div>
                          </td>
                          <td className="p-4 text-sm text-brand-tertiary font-medium">
                            <div>{formatValue(reading.inputWatts, 'W', 0)}</div>
                            {panels && (
                              <div className="text-xs text-text-muted mt-1" title={getInputSourceDescription(reading)} aria-description={getInputSourceDescription(reading)}>
                                Panels: {panels.watts.toFixed(0)}W
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-sm text-warning font-medium">
                            {formatValue(reading.outputWatts, 'W', 0)}
                          </td>
                          <td className="p-4 text-sm text-brand-secondary font-medium">
                            {formatValue(reading.acOutputWatts, 'W', 0)}
                          </td>
                          <td className="p-4 text-sm text-warning font-medium">
                            {formatValue(reading.dcOutputWatts, 'W', 0)}
                          </td>
                          <td className="p-4 text-sm text-success font-medium">
                            {formatValue(reading.usbOutputWatts, 'W', 0)}
                          </td>
                          {TEMPERATURE_FEATURE_ENABLED && (<td className="p-4 text-sm text-danger font-medium">
                            {formatValue(reading.temperature, '°C')}
                            {filters.aggregation !== 'raw' && (reading.temperatureSampleCount ?? 0) > 0 && (
                              <div className="mt-1 text-xs text-text-muted">{reading.temperatureSampleCount} temperature readings</div>
                            )}
                          </td>)}
                          <td className="p-4 text-sm">
                            <span className={`px-2 py-1 rounded-pill text-xs font-medium ${
                              reading.status === 'charging' ? 'bg-brand-primary/10 text-brand-primary' :
                              reading.status === 'discharging' ? 'bg-brand-tertiary/10 text-brand-tertiary' :
                              reading.status === 'full' ? 'bg-success/10 text-success' :
                              reading.status === 'low' ? 'bg-danger/10 text-danger' :
                              reading.status === 'standby' ? 'bg-surface-2 text-text-secondary' :
                              'bg-surface-2 text-text-muted'
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
            {tableReadings.length > 0 && (
              <div className="p-4 border-t border-stroke-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-text-muted">
                  Showing {Math.min(startIndex + 1, tableReadings.length)}-{Math.min(endIndex, tableReadings.length)} of {tableReadings.length} rows
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-surface-2 hover:bg-surface-2/80 text-text-secondary rounded-pill border border-stroke-subtle text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-160"
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
                          className="w-8 h-8 flex items-center justify-center text-sm text-text-secondary hover:bg-surface-2 rounded-pill border border-stroke-subtle transition-all duration-160"
                        >
                          1
                        </button>
                        {currentPage > 4 && <span className="text-text-muted px-1">...</span>}
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
                          className={`w-8 h-8 flex items-center justify-center text-sm rounded-pill border transition-all duration-160 ${
                            pageNum === currentPage
                              ? 'bg-brand-primary text-bg-base border-brand-primary'
                              : 'text-text-secondary hover:bg-surface-2 border-stroke-subtle'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    
                    {/* Last page */}
                    {currentPage < totalPages - 2 && (
                      <>
                        {currentPage < totalPages - 3 && <span className="text-text-muted px-1">...</span>}
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          className="w-8 h-8 flex items-center justify-center text-sm text-text-secondary hover:bg-surface-2 rounded-pill border border-stroke-subtle transition-all duration-160"
                        >
                          {totalPages}
                        </button>
                      </>
                    )}
                  </div>
                  
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-surface-2 hover:bg-surface-2/80 text-text-secondary rounded-pill border border-stroke-subtle text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-160"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* No Devices State */}
          {devices.length === 0 && (
            <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-8 text-center">
              <Battery className="w-16 h-16 text-text-muted mx-auto mb-4" />
              <h3 className="text-xl font-medium text-text-secondary mb-2">No Devices Found</h3>
              <p className="text-text-muted mb-6">
                You need to add and register devices before viewing historical data.
              </p>
              <Link
                href="/devices/add"
                className="inline-flex items-center gap-2 bg-brand-primary hover:bg-brand-secondary text-bg-base font-medium py-3 px-6 rounded-pill transition-all duration-160 text-sm"
              >
                <ExternalLink size={16} />
                Add Your First Device
              </Link>
            </div>
          )}
        </div>
      </div>
    
  )
}

// Wrap with authentication
export default function HistoryPageWrapper() {
  return (
    
      <HistoryPage />
    
  )
}
