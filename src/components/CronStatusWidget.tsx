'use client'

import { Clock, Smartphone, Database, Play, Pause } from 'lucide-react'
import { useClientSideReadingCollection } from '@/hooks/useClientSideReadingCollection'
import { useState, useEffect } from 'react'

interface MonitoringData {
  summary?: {
    totalReadings: number
    totalDevices: number
  }
  recentReadings?: Array<{
    recordedAt: string
  }>
}

export default function CronStatusWidget() {
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null)
  const [loading, setLoading] = useState(true)

  const {
    status: clientStatus,
    startCollection,
    stopCollection
  } = useClientSideReadingCollection(5) // 5-minute intervals

  const fetchMonitoringData = async () => {
    try {
      const response = await fetch('/api/monitor-readings')
      if (response.ok) {
        const data = await response.json()
        setMonitoringData(data)
      }
    } catch (error) {
      console.error('Error fetching monitoring data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMonitoringData()
    const interval = setInterval(fetchMonitoringData, 30000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-4 min-w-80">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-primary"></div>
          <span className="text-sm text-text-muted">Loading collection status...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-4 min-w-80">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-md font-bold text-text-primary">Data Collection Status</h3>
          <div className={`w-2 h-2 rounded-full ${clientStatus.isActive ? 'bg-brand-primary animate-pulse' : 'bg-text-muted'}`} />
        </div>

        {/* Database Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-brand-tertiary" />
              <span className="text-sm font-semibold text-text-primary">Database Stats</span>
            </div>
          </div>

          <div className="pl-6 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Total Readings:</span>
              <span className="text-text-primary font-medium">
                {monitoringData?.summary?.totalReadings?.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-text-muted">Active Devices:</span>
              <span className="text-text-primary font-medium">
                {monitoringData?.summary?.totalDevices || 0}
              </span>
            </div>
            {monitoringData?.recentReadings?.[0] && (
              <div className="flex justify-between text-xs">
                <span className="text-text-muted">Last Reading:</span>
                <span className="text-text-primary font-medium">
                  {new Date(monitoringData.recentReadings[0].recordedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Daily Cron Job (Vercel) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-tertiary" />
              <span className="text-sm font-semibold text-text-primary">Daily Backup (Vercel)</span>
            </div>
            <span className="px-2 py-1 bg-brand-primary/20 text-brand-primary text-xs rounded-pill font-medium">
              ACTIVE
            </span>
          </div>

          <div className="pl-6 space-y-1">
            <div className="text-xs text-text-muted">
              Schedule: Daily at midnight UTC
            </div>
            <div className="text-xs text-brand-primary">
              ✓ Vercel Free Plan compatible
            </div>
          </div>
        </div>

        {/* Client-Side Collection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-brand-primary" />
              <span className="text-sm font-semibold text-text-primary">Active Collection</span>
            </div>
            <span className={`px-2 py-1 text-xs rounded-pill font-medium ${
              clientStatus.isActive 
                ? 'bg-brand-primary/20 text-brand-primary' 
                : 'bg-surface-2 text-text-muted'
            }`}>
              {clientStatus.isActive ? 'RUNNING' : 'STOPPED'}
            </span>
          </div>

          <div className="pl-6 space-y-1">
            <div className="text-xs text-text-muted">
              Frequency: Every {clientStatus.intervalMinutes} minutes
            </div>
            {clientStatus.lastCollection && (
              <div className="text-xs text-text-muted">
                Last: {new Date(clientStatus.lastCollection).toLocaleTimeString()}
              </div>
            )}
            <div className="flex gap-3">
              <span className="text-xs text-brand-primary">
                ✓ {clientStatus.successCount}
              </span>
              <span className="text-xs text-danger">
                ✗ {clientStatus.errorCount}
              </span>
            </div>
          </div>

          {/* Control Button */}
          <div className="flex justify-center pt-2">
            <button
              onClick={clientStatus.isActive ? stopCollection : startCollection}
              className={`flex items-center gap-2 px-3 py-1 text-sm border rounded-pill transition-colors ${
                clientStatus.isActive
                  ? 'border-danger text-danger hover:bg-danger/10'
                  : 'border-brand-primary text-brand-primary hover:bg-brand-primary/10'
              }`}
            >
              {clientStatus.isActive ? (
                <Pause className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {clientStatus.isActive ? 'Stop' : 'Start'} Collection
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-brand-tertiary/5 border border-brand-tertiary/15 rounded-inner p-3">
          <div className="text-xs text-brand-tertiary">
            💡 <strong>Hybrid Collection:</strong> Daily Vercel cron ensures data backup, 
            while active collection runs when you&apos;re using the dashboard for real-time data.
          </div>
        </div>
      </div>
    </div>
  )
}