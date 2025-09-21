'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Activity, Clock, CheckCircle, XCircle } from 'lucide-react'
import { useAutomaticReadingCollection } from '@/hooks/useAutomaticReadingCollection'

interface ReadingCollectorProps {
  intervalSeconds?: number
  autoStart?: boolean
}

export default function ReadingCollector({ 
  intervalSeconds = 30, 
  autoStart = false 
}: ReadingCollectorProps) {
  const [isVisible, setIsVisible] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const { status, startCollection, stopCollection, collectReading } = useAutomaticReadingCollection(intervalSeconds)

  const handleStart = () => {
    if (intervalRef.current) {
      stopCollection(intervalRef.current)
    }
    intervalRef.current = startCollection()
  }

  const handleStop = () => {
    if (intervalRef.current) {
      stopCollection(intervalRef.current)
      intervalRef.current = null
    }
  }

  const handleManualCollection = async () => {
    await collectReading()
  }

  // Auto-start if enabled
  useEffect(() => {
    if (autoStart && !status.isActive) {
      handleStart()
    }

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        stopCollection(intervalRef.current)
      }
    }
  }, [autoStart])

  // Auto-start when dashboard becomes visible (user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && autoStart && !status.isActive) {
        console.log('🔄 Dashboard visible - restarting reading collection')
        handleStart()
      } else if (document.visibilityState === 'hidden' && status.isActive) {
        console.log('👁️ Dashboard hidden - pausing reading collection')
        handleStop()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [autoStart, status.isActive])

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-accent-green hover:bg-accent-green-secondary text-primary-black p-3 rounded-full shadow-lg transition-colors z-50"
        title="Show Reading Collector"
      >
        <Activity className="w-5 h-5" />
      </button>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 bg-primary-dark border border-accent-green/20 rounded-lg p-4 shadow-xl z-50 min-w-80">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent-green" />
          Reading Collector
        </h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-accent-gray hover:text-white text-sm"
        >
          ✕
        </button>
      </div>

      {/* Status */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-accent-gray">Status:</span>
          <div className="flex items-center gap-1">
            {status.isActive ? (
              <>
                <div className="w-2 h-2 bg-accent-green rounded-full animate-pulse" />
                <span className="text-accent-green">Active</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-gray-500 rounded-full" />
                <span className="text-gray-400">Stopped</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-accent-gray">Interval:</span>
          <span className="text-white">{status.currentInterval}s</span>
        </div>

        {status.lastCollection && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-accent-gray">Last:</span>
            <span className="text-white">
              {new Date(status.lastCollection).toLocaleTimeString()}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs">
          <span className="text-accent-gray">Success/Errors:</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-accent-green" />
              <span className="text-accent-green">{status.successCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-red-400" />
              <span className="text-red-400">{status.errorCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        {status.isActive ? (
          <button
            onClick={handleStop}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
          >
            <Pause className="w-3 h-3" />
            Stop
          </button>
        ) : (
          <button
            onClick={handleStart}
            className="flex-1 bg-accent-green hover:bg-accent-green-secondary text-primary-black px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
          >
            <Play className="w-3 h-3" />
            Start
          </button>
        )}
        
        <button
          onClick={handleManualCollection}
          className="bg-primary-black hover:bg-gray-800 text-accent-gray border border-accent-gray/30 hover:border-accent-gray/50 px-3 py-2 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1"
        >
          <Clock className="w-3 h-3" />
          Collect Now
        </button>
      </div>

      {/* Auto-start notice */}
      {autoStart && (
        <div className="mt-2 text-xs text-accent-gray">
          ℹ️ Auto-collection enabled
        </div>
      )}
    </div>
  )
}