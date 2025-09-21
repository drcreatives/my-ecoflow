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
      <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-4 min-w-80">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-accent-green"></div>
          <span className="text-sm text-accent-gray">Loading collection status...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-4 min-w-80">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-md font-bold text-white">Data Collection Status</h3>
          <div className={`w-2 h-2 rounded-full ${clientStatus.isActive ? 'bg-accent-green animate-pulse' : 'bg-gray-500'}`} />
        </div>

        {/* Database Stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-accent-blue" />
              <span className="text-sm font-semibold text-white">Database Stats</span>
            </div>
          </div>

          <div className="pl-6 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-accent-gray">Total Readings:</span>
              <span className="text-white font-medium">
                {monitoringData?.summary?.totalReadings?.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-accent-gray">Active Devices:</span>
              <span className="text-white font-medium">
                {monitoringData?.summary?.totalDevices || 0}
              </span>
            </div>
            {monitoringData?.recentReadings?.[0] && (
              <div className="flex justify-between text-xs">
                <span className="text-accent-gray">Last Reading:</span>
                <span className="text-white font-medium">
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
              <Clock className="w-4 h-4 text-accent-blue" />
              <span className="text-sm font-semibold text-white">Daily Backup (Vercel)</span>
            </div>
            <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-medium">
              ACTIVE
            </span>
          </div>

          <div className="pl-6 space-y-1">
            <div className="text-xs text-accent-gray">
              Schedule: Daily at midnight UTC
            </div>
            <div className="text-xs text-accent-green">
              ✓ Vercel Free Plan compatible
            </div>
          </div>
        </div>

        {/* Client-Side Collection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-accent-green" />
              <span className="text-sm font-semibold text-white">Active Collection</span>
            </div>
            <span className={`px-2 py-1 text-xs rounded-full font-medium ${
              clientStatus.isActive 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              {clientStatus.isActive ? 'RUNNING' : 'STOPPED'}
            </span>
          </div>

          <div className="pl-6 space-y-1">
            <div className="text-xs text-accent-gray">
              Frequency: Every {clientStatus.intervalMinutes} minutes
            </div>
            {clientStatus.lastCollection && (
              <div className="text-xs text-accent-gray">
                Last: {new Date(clientStatus.lastCollection).toLocaleTimeString()}
              </div>
            )}
            <div className="flex gap-3">
              <span className="text-xs text-accent-green">
                ✓ {clientStatus.successCount}
              </span>
              <span className="text-xs text-red-400">
                ✗ {clientStatus.errorCount}
              </span>
            </div>
          </div>

          {/* Control Button */}
          <div className="flex justify-center pt-2">
            <button
              onClick={clientStatus.isActive ? stopCollection : startCollection}
              className={`flex items-center gap-2 px-3 py-1 text-sm border rounded-md transition-colors ${
                clientStatus.isActive
                  ? 'border-red-400 text-red-400 hover:bg-red-400/10'
                  : 'border-accent-green text-accent-green hover:bg-accent-green/10'
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
        <div className="bg-accent-blue/10 border border-accent-blue/30 rounded-md p-3">
          <div className="text-xs text-accent-blue">
            💡 <strong>Hybrid Collection:</strong> Daily Vercel cron ensures data backup, 
            while active collection runs when you&apos;re using the dashboard for real-time data.
          </div>
        </div>
      </div>
    </div>
  )
}