'use client'

import { useState, useEffect } from 'react'
import { Clock, Activity, Database, TrendingUp } from 'lucide-react'

interface CronStatus {
  isConfigured: boolean
  lastReading?: {
    timestamp: string
    deviceCount: number
    successCount: number
  }
  totalReadings: number
  devicesActive: number
}

export default function CronStatusWidget() {
  const [status, setStatus] = useState<CronStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    try {
      // Get monitoring data to show cron status
      const response = await fetch('/api/monitor-readings')
      if (response.ok) {
        const data = await response.json()
        
        setStatus({
          isConfigured: true, // If we get data, cron is working
          totalReadings: data.summary?.totalReadings || 0,
          devicesActive: data.summary?.totalDevices || 0,
          lastReading: data.recentReadings?.[0] ? {
            timestamp: data.recentReadings[0].recordedAt,
            deviceCount: data.summary.totalDevices,
            successCount: data.recentReadings.length
          } : undefined
        })
      }
    } catch (error) {
      console.error('Error fetching cron status:', error)
      setStatus({
        isConfigured: false,
        totalReadings: 0,
        devicesActive: 0
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-primary-black rounded w-32 mb-2"></div>
          <div className="h-3 bg-primary-black rounded w-24"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-primary-dark border border-accent-green/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-accent-green" />
        <h3 className="text-sm font-semibold text-white">Auto Collection</h3>
        <div className={`w-2 h-2 rounded-full ${status?.isConfigured ? 'bg-accent-green animate-pulse' : 'bg-red-400'}`} />
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-accent-gray flex items-center gap-1">
            <Database className="w-3 h-3" />
            Total Readings:
          </span>
          <span className="text-white font-medium">{status?.totalReadings?.toLocaleString() || 0}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-accent-gray flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Active Devices:
          </span>
          <span className="text-white font-medium">{status?.devicesActive || 0}</span>
        </div>

        {status?.lastReading && (
          <div className="flex items-center justify-between">
            <span className="text-accent-gray flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Last Collection:
            </span>
            <span className="text-white font-medium">
              {new Date(status.lastReading.timestamp).toLocaleTimeString()}
            </span>
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-gray-700">
          <div className="text-accent-gray">
            {status?.isConfigured ? (
              <span className="text-accent-green">✓ Collecting every minute</span>
            ) : (
              <span className="text-red-400">⚠ Collection disabled</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}