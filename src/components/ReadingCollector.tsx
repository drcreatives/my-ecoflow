'use client'

import { useState, useEffect } from 'react'
import { Play, Activity, Clock, CheckCircle, XCircle, Settings, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface CollectionStatus {
  lastCollection: string | null
  nextScheduled: string | null
  intervalMinutes: number
  successCount: number
  errorCount: number
  isCollecting: boolean
}

interface CollectionStatusControlProps {
  autoCollect?: boolean
}

export default function CollectionStatusControl({ 
  autoCollect = true 
}: CollectionStatusControlProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [status, setStatus] = useState<CollectionStatus>({
    lastCollection: null,
    nextScheduled: null,
    intervalMinutes: 5,
    successCount: 0,
    errorCount: 0,
    isCollecting: false
  })

  // Load collection status and user settings
  useEffect(() => {
    loadCollectionStatus()
    
    // Refresh status every 30 seconds
    const interval = setInterval(loadCollectionStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadCollectionStatus = async () => {
    try {
      // Get user's collection interval settings
      const settingsResponse = await fetch('/api/user/data-retention')
      if (settingsResponse.ok) {
        const { settings } = await settingsResponse.json()
        
        // Get last collection time from latest device reading
        const readingsResponse = await fetch('/api/devices/latest-readings')
        let lastCollection = null
        if (readingsResponse.ok) {
          const readings = await readingsResponse.json()
          if (readings.length > 0) {
            lastCollection = readings[0].recorded_at
          }
        }

        // Calculate next scheduled collection
        let nextScheduled = null
        if (lastCollection) {
          const lastTime = new Date(lastCollection)
          const intervalMs = settings.collection_interval_minutes * 60 * 1000
          nextScheduled = new Date(lastTime.getTime() + intervalMs).toISOString()
        }

        setStatus(prev => ({
          ...prev,
          lastCollection,
          nextScheduled,
          intervalMinutes: settings.collection_interval_minutes
        }))
      }
    } catch (error) {
      console.error('Failed to load collection status:', error)
    }
  }

  const handleManualCollection = async () => {
    if (status.isCollecting) return

    // Check if enough time has passed since last collection (at least 1 minute)
    if (status.lastCollection) {
      const lastTime = new Date(status.lastCollection)
      const now = new Date()
      const timeSinceLastMs = now.getTime() - lastTime.getTime()
      const oneMinuteMs = 60 * 1000
      
      if (timeSinceLastMs < oneMinuteMs) {
        const secondsLeft = Math.ceil((oneMinuteMs - timeSinceLastMs) / 1000)
        toast.error(`Please wait ${secondsLeft} seconds before collecting again`)
        return
      }
    }

    setStatus(prev => ({ ...prev, isCollecting: true }))
    
    try {
      toast.info('Starting manual collection...')
      
      const response = await fetch('/api/devices/collect-readings?force=true', {
        method: 'POST'
      })
      
      if (response.ok) {
        const result = await response.json()
        toast.success(`Collection completed: ${result.summary?.totalSuccessful || 0} devices updated`)
        
        setStatus(prev => ({
          ...prev,
          successCount: prev.successCount + (result.summary?.totalSuccessful || 0),
          errorCount: prev.errorCount + (result.summary?.totalFailed || 0),
          lastCollection: new Date().toISOString()
        }))
        
        // Reload status to get fresh data
        setTimeout(loadCollectionStatus, 1000)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Collection failed')
        setStatus(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
      }
    } catch (error) {
      console.error('Manual collection error:', error)
      toast.error('Collection failed: Network error')
      setStatus(prev => ({ ...prev, errorCount: prev.errorCount + 1 }))
    } finally {
      setStatus(prev => ({ ...prev, isCollecting: false }))
    }
  }

  const formatTimeAgo = (dateString: string | null) => {
    if (!dateString) return 'Never'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMinutes / 60)
    
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  const formatTimeUntil = (dateString: string | null) => {
    if (!dateString) return 'Unknown'
    
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    
    if (diffMs <= 0) return 'Now'
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMinutes / 60)
    
    if (diffMinutes < 1) return 'Now'
    if (diffMinutes < 60) return `${diffMinutes}m`
    return `${diffHours}h ${diffMinutes % 60}m`
  }

  const isOverdue = () => {
    if (!status.nextScheduled) return false
    return new Date() > new Date(status.nextScheduled)
  }

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-brand-primary hover:bg-brand-secondary text-bg-base p-3 rounded-full shadow-card transition-colors z-50"
        title="Show Collection Status"
      >
        <Activity className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 bg-surface-1 border border-stroke-subtle rounded-card p-4 shadow-card z-50 min-w-80">
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

      {/* Collection Status Information */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Collection Mode:</span>
          <div className="flex items-center gap-1">
            {autoCollect ? (
              <>
                <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse" />
                <span className="text-brand-primary">Automatic</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-text-muted rounded-full" />
                <span className="text-text-muted">Manual</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Interval:</span>
          <span className="text-text-primary">{status.intervalMinutes} minutes</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Last Collection:</span>
          <span className="text-text-primary">
            {formatTimeAgo(status.lastCollection)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Next Collection:</span>
          <span className={`${isOverdue() ? 'text-warning' : 'text-text-primary'}`}>
            {formatTimeUntil(status.nextScheduled)}
            {isOverdue() && ' (overdue)'}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Success/Errors:</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-brand-primary" />
              <span className="text-brand-primary">{status.successCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-danger" />
              <span className="text-danger">{status.errorCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleManualCollection}
          disabled={status.isCollecting}
          className="flex-1 bg-brand-primary hover:bg-brand-secondary disabled:bg-surface-2 disabled:cursor-not-allowed text-bg-base disabled:text-text-muted px-3 py-2 rounded-pill text-xs font-medium transition-colors flex items-center justify-center gap-1"
        >
          {status.isCollecting ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin" />
              Collecting...
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              Collect Now
            </>
          )}
        </button>
        
        <button
          onClick={() => window.location.href = '/settings?tab=data'}
          className="bg-surface-2 hover:bg-surface-2/80 text-text-secondary border border-stroke-subtle px-3 py-2 rounded-pill text-xs font-medium transition-colors flex items-center justify-center gap-1"
          title="Configure collection settings"
        >
          <Settings className="w-3 h-3" />
        </button>
      </div>

      {/* Status Messages */}
      {autoCollect && (
        <div className="mt-2 text-xs text-text-muted">
          ℹ️ Automated collection every {status.intervalMinutes} minutes
        </div>
      )}
      
      {isOverdue() && (
        <div className="mt-2 text-xs text-warning">
          ⚠️ Collection is overdue - check your settings
        </div>
      )}
    </div>
  )
}