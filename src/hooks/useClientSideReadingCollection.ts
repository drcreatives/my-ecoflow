'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface ReadingCollectionStatus {
  isActive: boolean
  lastCollection: string | null
  successCount: number
  errorCount: number
  intervalMinutes: number
}

interface UseClientSideReadingCollectionOptions {
  /** Collection interval in minutes (sourced from user settings). */
  intervalMinutes?: number
  /**
   * Called after every *successful* collection so the caller can refresh
   * Zustand stores (devices, readings, etc.) without a full page reload.
   */
  onCollectionSuccess?: () => void
}

/**
 * Client-side reading collection hook (Web-Worker-driven).
 *
 * **Why a Web Worker?**
 * Browsers aggressively throttle `setInterval` on hidden tabs (Chrome: once
 * per minute after 5 min, potentially frozen after extended periods).  A
 * dedicated Web Worker runs in its own thread and is NOT subject to those
 * restrictions, so the timer keeps firing even when the tab has been hidden
 * for hours.
 *
 * Uses the user-scoped `/api/devices/collect-readings/self` endpoint so the
 * companion service worker can also call it with auth cookies.
 */
export const useClientSideReadingCollection = (
  options: UseClientSideReadingCollectionOptions = {}
) => {
  const { intervalMinutes = 5, onCollectionSuccess } = options

  const [status, setStatus] = useState<ReadingCollectionStatus>({
    isActive: false,
    lastCollection: null,
    successCount: 0,
    errorCount: 0,
    intervalMinutes,
  })

  const workerRef = useRef<Worker | null>(null)
  const currentIntervalRef = useRef(intervalMinutes)
  const onSuccessRef = useRef(onCollectionSuccess)
  const isCollectingRef = useRef(false)
  const collectReadingRef = useRef<() => Promise<unknown>>(null!)

  // Keep the callback ref current without re-running effects
  useEffect(() => {
    onSuccessRef.current = onCollectionSuccess
  }, [onCollectionSuccess])

  // ------------------------------------------------------------------
  // Core collection call
  // ------------------------------------------------------------------
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const collectReading = useCallback(async () => {
    // Guard against overlapping calls (worker ticks may queue up)
    if (isCollectingRef.current) return
    isCollectingRef.current = true

    try {
      console.log('📊 [CLIENT] Collecting device reading...')

      const response = await fetch('/api/devices/collect-readings/self', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ [CLIENT] Reading collection successful:', data.summary)

        setStatus((prev) => ({
          ...prev,
          lastCollection: new Date().toISOString(),
          successCount: prev.successCount + 1,
        }))

        // Notify the caller so it can refresh stores
        onSuccessRef.current?.()

        return { success: true, data }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      console.error('❌ Client reading collection failed:', error)

      setStatus((prev) => ({
        ...prev,
        errorCount: prev.errorCount + 1,
      }))

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    } finally {
      isCollectingRef.current = false
    }
  }, [])

  // Keep ref current so the worker onmessage handler never has a stale closure
  useEffect(() => {
    collectReadingRef.current = collectReading
  }, [collectReading])

  // ------------------------------------------------------------------
  // Web Worker lifecycle
  // ------------------------------------------------------------------
  const ensureWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current

    if (typeof window === 'undefined') return null

    try {
      const worker = new Worker('/collection-worker.js')

      worker.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'TICK') {
          // Call via ref to always use the latest collectReading
          collectReadingRef.current()
        }
      }

      worker.onerror = (err) => {
        console.error('[CollectionWorker] error:', err)
      }

      workerRef.current = worker
      return worker
    } catch (err) {
      console.error('[CollectionWorker] Failed to create worker:', err)
      return null
    }
  }, [])  // no deps — worker onmessage uses ref, not closure

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  const startCollection = useCallback(() => {
    // Guard: if the worker is already running at this interval, skip
    if (status.isActive && currentIntervalRef.current === intervalMinutes) {
      console.log('[CLIENT] Collection already active — skipping duplicate start')
      return
    }

    currentIntervalRef.current = intervalMinutes

    console.log(
      `🚀 [CLIENT] Starting reading collection via Web Worker (every ${intervalMinutes} min)`
    )

    setStatus((prev) => ({
      ...prev,
      isActive: true,
      intervalMinutes,
    }))

    const worker = ensureWorker()
    worker?.postMessage({
      type: 'START',
      intervalMs: intervalMinutes * 60 * 1000,
    })
  }, [intervalMinutes, ensureWorker, status.isActive])

  const stopCollection = useCallback(() => {
    console.log('⏹️ Stopping client-side reading collection')

    workerRef.current?.postMessage({ type: 'STOP' })

    setStatus((prev) => ({ ...prev, isActive: false }))
  }, [])

  /**
   * Update the collection interval on-the-fly without a full restart.
   * Also re-registers the service-worker periodic sync so foreground and
   * background intervals stay in sync.
   */
  const updateInterval = useCallback(
    (newMinutes: number) => {
      if (newMinutes === currentIntervalRef.current) return
      console.log(`[CLIENT] Updating collection interval to ${newMinutes} min`)
      currentIntervalRef.current = newMinutes

      // Update the Web Worker timer
      workerRef.current?.postMessage({
        type: 'UPDATE_INTERVAL',
        intervalMs: newMinutes * 60 * 1000,
      })

      setStatus((prev) => ({ ...prev, intervalMinutes: newMinutes }))

      // Best-effort: re-register SW periodic sync with the new interval
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then(async (reg) => {
            if ('periodicSync' in reg) {
              try {
                const perm = await navigator.permissions.query({
                  // @ts-expect-error periodicSync permission not in lib.dom.d.ts yet
                  name: 'periodic-background-sync',
                })
                if (perm.state === 'granted') {
                  // @ts-expect-error periodicSync API not in lib.dom.d.ts yet
                  await reg.periodicSync.register('collect-readings', {
                    minInterval: Math.max(newMinutes, 1) * 60 * 1000,
                  })
                  console.log(`[SW] Periodic sync re-registered (${newMinutes} min)`)
                }
              } catch {
                // periodic sync unavailable — foreground collector is primary
              }
            }
          })
          .catch(() => {
            // no active SW — nothing to update
          })
      }
    },
    []
  )

  // ------------------------------------------------------------------
  // Cleanup – terminate the worker on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  return {
    status,
    startCollection,
    stopCollection,
    collectReading,
    updateInterval,
  }
}
