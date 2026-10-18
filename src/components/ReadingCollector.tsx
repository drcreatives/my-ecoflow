'use client'

import { useState, useMemo } from 'react'
import { Activity, Settings } from 'lucide-react'
import { useConvexDevices, useConvexSettings } from '@/hooks/useConvexData'
import { getReadingFreshness } from '@/lib/reading-status'

export default function CollectionStatusControl() {
  const [isVisible, setIsVisible] = useState(false)
  const { devices } = useConvexDevices()
  const { dataRetention } = useConvexSettings()
  const collectionInterval = dataRetention?.collectionIntervalMinutes ?? 5

  // Derive last collection time from latest device readings
  const lastCollectionTime = useMemo(() => {
    let latest: number | null = null
    for (const device of devices) {
      const reading = device.currentReading
      if (reading?.recordedAt != null) {
        const t = typeof reading.recordedAt === 'number' ? reading.recordedAt : new Date(reading.recordedAt).getTime()
        if (!latest || t > latest) latest = t
      }
    }
    return latest ? new Date(latest) : null
  }, [devices])
  const freshness = getReadingFreshness(lastCollectionTime, collectionInterval)

  const formatTimeAgo = (date: Date | null) => {
    if (!date) return 'Never'
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-brand-primary hover:bg-brand-secondary text-bg-base p-3 rounded-full shadow-card transition-colors z-50"
        title="Show Collection Status"
        aria-label="Show Collection Status"
      >
        <Activity className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 bg-surface-1 border border-stroke-subtle rounded-card p-4 shadow-card z-50 min-w-72">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <Activity className="w-4 h-4 text-brand-primary" />
          Collection Status
        </h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-text-muted hover:text-text-primary text-sm"
        >
          ✕
        </button>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Collection Mode:</span>
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${freshness === 'recent' ? 'bg-brand-primary animate-pulse' : 'bg-warning'}`} />
            <span className="text-text-primary">Server (Convex Cron)</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Interval:</span>
          <span className="text-text-primary">{collectionInterval} {collectionInterval === 1 ? 'minute' : 'minutes'}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Last Reading Fetched:</span>
          <span className={freshness === 'stale' ? 'text-warning' : 'text-text-primary'} title={lastCollectionTime?.toLocaleString()}>
            {formatTimeAgo(lastCollectionTime)}
            {freshness === 'stale' ? ' (stale)' : ''}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Devices:</span>
          <span className="text-text-primary">{devices.length} registered</span>
        </div>
      </div>

      <button
        onClick={() => window.location.href = '/settings?tab=data'}
        className="w-full bg-surface-2 hover:bg-surface-2/80 text-text-secondary border border-stroke-subtle px-3 py-2 rounded-pill text-xs font-medium transition-colors flex items-center justify-center gap-1"
        title="Configure collection settings"
      >
        <Settings className="w-3 h-3" />
        Settings
      </button>

      <div className="mt-2 text-xs text-text-muted">
        Server checks the configured interval every minute. The device measurement time is unavailable.
      </div>
    </div>
  )
}
