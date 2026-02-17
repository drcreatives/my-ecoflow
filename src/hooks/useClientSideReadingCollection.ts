'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface ReadingCollectionStatus {
  isActive: boolean
  lastCollection: string | null
  successCount: number
  errorCount: number
  intervalMinutes: number
}

/**
 * Client-side reading collection for Vercel Free Plan.
 *
 * Runs on a configurable interval (sourced from user settings).
 * Does NOT pause when the tab is hidden — collection continues in the
 * background as long as the page is open. A companion service worker
 * handles collection when the page is closed (best-effort).
 *
 * Uses the user-scoped `/api/devices/collect-readings/self` endpoint so
 * the service worker can also call it with auth cookies.
 */
export const useClientSideReadingCollection = (intervalMinutes: number = 5) => {
  const [status, setStatus] = useState<ReadingCollectionStatus>({
    isActive: false,
    lastCollection: null,
    successCount: 0,
    errorCount: 0,
    intervalMinutes
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const currentIntervalRef = useRef(intervalMinutes)

  const collectReading = useCallback(async () => {
    try {
      console.log('📊 [CLIENT] Collecting device reading...')

      const response = await fetch('/api/devices/collect-readings/self', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ [CLIENT] Reading collection successful:', data.summary)

        setStatus(prev => ({
          ...prev,
          lastCollection: new Date().toISOString(),
          successCount: prev.successCount + 1
        }))

        return { success: true, data }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      console.error('❌ Client reading collection failed:', error)

      setStatus(prev => ({
        ...prev,
        errorCount: prev.errorCount + 1
      }))

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, [])

  const startCollection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    currentIntervalRef.current = intervalMinutes

    console.log(
      `🚀 [CLIENT] Starting reading collection (every ${intervalMinutes} min, runs while hidden)`
    )

    setStatus(prev => ({
      ...prev,
      isActive: true,
      intervalMinutes
    }))

    // Collect immediately on start
    collectReading()

    // Set up interval (convert minutes to ms)
    intervalRef.current = setInterval(collectReading, intervalMinutes * 60 * 1000)
  }, [intervalMinutes, collectReading])

  const stopCollection = useCallback(() => {
    console.log('⏹️ Stopping client-side reading collection')

    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    setStatus(prev => ({ ...prev, isActive: false }))
  }, [])

  /**
   * Update the collection interval on-the-fly without a full restart.
   */
  const updateInterval = useCallback(
    (newMinutes: number) => {
      if (newMinutes === currentIntervalRef.current) return
      console.log(`🔄 [CLIENT] Updating collection interval to ${newMinutes} min`)
      currentIntervalRef.current = newMinutes

      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = setInterval(collectReading, newMinutes * 60 * 1000)
      }

      setStatus(prev => ({ ...prev, intervalMinutes: newMinutes }))
    },
    [collectReading]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return {
    status,
    startCollection,
    stopCollection,
    collectReading,
    updateInterval
  }
}