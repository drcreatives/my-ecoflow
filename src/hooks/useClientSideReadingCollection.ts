'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LAST_COLLECTION_KEY = 'ecoflow:lastCollectionTs'

/**
 * If the worker hasn't sent a heartbeat in this many ms we consider it dead
 * and restart it.  The worker sends heartbeats every 30 s, so 90 s gives a
 * generous buffer (missed 2 beats = dead).
 */
const HEARTBEAT_TIMEOUT = 90_000

/**
 * How often the main thread checks the heartbeat (ms).
 */
const HEARTBEAT_CHECK_INTERVAL = 45_000

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------
function persistLastCollection(ts: number) {
  try {
    localStorage.setItem(LAST_COLLECTION_KEY, String(ts))
  } catch {
    // Private browsing or quota exceeded — non-critical
  }
}

function getPersistedLastCollection(): number {
  try {
    const raw = localStorage.getItem(LAST_COLLECTION_KEY)
    return raw ? Number(raw) : 0
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Silent AudioContext keepalive
// ---------------------------------------------------------------------------
// Chrome (87+) applies "intensive timer throttling" to hidden tabs, limiting
// setInterval/setTimeout to at most once per minute — even inside Web Workers
// in some builds (108+).  Web Locks do NOT prevent this.
//
// However Chrome EXEMPTS tabs that have an AudioContext in the "running" state
// from ALL timer throttling.  This is the same technique Discord, Google Meet
// and Slack use to keep real-time features alive in background tabs.
//
// We create a minimal audio graph (silent oscillator → gain=0 → destination)
// that produces no audible output but keeps the AudioContext alive.
// ---------------------------------------------------------------------------
let keepaliveCtx: AudioContext | null = null

function startAudioKeepalive(): void {
  if (typeof window === 'undefined' || keepaliveCtx) return

  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return

    const ctx = new AudioCtx()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()

    // Inaudible: 1 Hz is far below human hearing, gain is 0
    oscillator.frequency.value = 1
    gain.gain.value = 0

    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start()

    // Handle autoplay policy — resume on first user interaction if needed
    if (ctx.state === 'suspended') {
      const resume = () => {
        ctx.resume().catch(() => {})
        document.removeEventListener('click', resume)
        document.removeEventListener('keydown', resume)
        document.removeEventListener('touchstart', resume)
      }
      document.addEventListener('click', resume, { once: true })
      document.addEventListener('keydown', resume, { once: true })
      document.addEventListener('touchstart', resume, { once: true })
    }

    keepaliveCtx = ctx
    console.log('[Keepalive] Silent AudioContext started — tab timer throttling disabled')
  } catch {
    // AudioContext unavailable — fall through to other layers
  }
}

function stopAudioKeepalive(): void {
  if (keepaliveCtx) {
    keepaliveCtx.close().catch(() => {})
    keepaliveCtx = null
    console.log('[Keepalive] Silent AudioContext stopped')
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Client-side reading collection hook (Web-Worker-driven, resilient).
 *
 * ### Strategy against hidden-tab / freeze gaps
 *
 * | Layer | What it does |
 * |-------|-------------|
 * | Web Worker timer | Fires at the configured interval; immune to main-thread throttling |
 * | Web Lock keepalive | Holds `navigator.locks` to hint Chrome not to freeze the tab |
 * | Heartbeat monitor | Worker pings every 30 s; main thread checks every 45 s and restarts if dead |
 * | localStorage timestamp | Survives tab freeze/discard so we always know how stale we are |
 * | Catch-up on resume | `visibilitychange` + `freeze`/`resume` events trigger an immediate force-collect when the gap exceeds the interval |
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
  const collectReadingRef = useRef<(force?: boolean) => Promise<unknown>>(null!)
  const lastHeartbeatRef = useRef<number>(Date.now())
  const heartbeatCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isActiveRef = useRef(false)

  // Keep the callback ref current without re-running effects
  useEffect(() => {
    onSuccessRef.current = onCollectionSuccess
  }, [onCollectionSuccess])

  // ------------------------------------------------------------------
  // Core collection call
  // ------------------------------------------------------------------
  const collectReading = useCallback(async (force = false) => {
    // Guard against overlapping calls (worker ticks may queue up)
    if (isCollectingRef.current) return
    isCollectingRef.current = true

    try {
      const url = force
        ? '/api/devices/collect-readings/self?force=true'
        : '/api/devices/collect-readings/self'

      console.log(`📊 [CLIENT] Collecting device reading...${force ? ' (force)' : ''}`)

      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        const data = await response.json()
        console.log('✅ [CLIENT] Reading collection successful:', data.summary)

        const now = Date.now()
        persistLastCollection(now)

        setStatus((prev) => ({
          ...prev,
          lastCollection: new Date(now).toISOString(),
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
  const createWorker = useCallback((): Worker | null => {
    // Terminate old worker if one exists (restart scenario)
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }

    if (typeof window === 'undefined') return null

    try {
      const worker = new Worker('/collection-worker.js')

      worker.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'TICK') {
          collectReadingRef.current()
        }
        if (event.data?.type === 'HEARTBEAT') {
          lastHeartbeatRef.current = event.data.timestamp ?? Date.now()
        }
      }

      worker.onerror = (err) => {
        console.error('[CollectionWorker] error:', err)
      }

      workerRef.current = worker
      lastHeartbeatRef.current = Date.now()
      return worker
    } catch (err) {
      console.error('[CollectionWorker] Failed to create worker:', err)
      return null
    }
  }, [])

  const ensureWorker = useCallback((): Worker | null => {
    if (workerRef.current) return workerRef.current
    return createWorker()
  }, [createWorker])

  /** Kill & recreate the worker, restarting the timer at the current interval. */
  const restartWorker = useCallback(() => {
    console.log('[CLIENT] Restarting dead/frozen Web Worker...')
    const worker = createWorker()
    if (worker && isActiveRef.current) {
      worker.postMessage({
        type: 'START',
        intervalMs: currentIntervalRef.current * 60 * 1000,
      })
    }
  }, [createWorker])

  // ------------------------------------------------------------------
  // Heartbeat monitor — detect if the worker was frozen/killed
  // ------------------------------------------------------------------
  const startHeartbeatMonitor = useCallback(() => {
    if (heartbeatCheckRef.current) return
    lastHeartbeatRef.current = Date.now()

    heartbeatCheckRef.current = setInterval(() => {
      const elapsed = Date.now() - lastHeartbeatRef.current
      if (elapsed > HEARTBEAT_TIMEOUT && isActiveRef.current) {
        console.warn(
          `[CLIENT] Worker heartbeat missing for ${Math.round(elapsed / 1000)}s — restarting`
        )
        restartWorker()
      }
    }, HEARTBEAT_CHECK_INTERVAL)
  }, [restartWorker])

  const stopHeartbeatMonitor = useCallback(() => {
    if (heartbeatCheckRef.current) {
      clearInterval(heartbeatCheckRef.current)
      heartbeatCheckRef.current = null
    }
  }, [])

  // ------------------------------------------------------------------
  // Catch-up: force-collect if the last collection is older than the
  // configured interval.  Called on visibility-change and resume.
  // ------------------------------------------------------------------
  const catchUpIfNeeded = useCallback(() => {
    if (!isActiveRef.current) return

    const lastTs = getPersistedLastCollection()
    if (lastTs === 0) return // never collected — initial collect will handle it

    const gap = Date.now() - lastTs
    const intervalMs = currentIntervalRef.current * 60 * 1000

    if (gap >= intervalMs) {
      console.log(
        `[CLIENT] Gap detected (${Math.round(gap / 60_000)} min) — force-collecting`
      )
      collectReadingRef.current(true)
    }
  }, [])

  // ------------------------------------------------------------------
  // Page Lifecycle listeners (freeze / resume + visibilitychange)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof document === 'undefined') return

    // "resume" fires when a frozen tab is unfrozen (Chrome Page Lifecycle).
    const handleResume = () => {
      console.log('[CLIENT] Page resumed from freeze')
      // The worker may be dead — restart and catch up
      if (isActiveRef.current) {
        restartWorker()
        catchUpIfNeeded()
      }
    }

    // "visibilitychange" fires on tab switch / screen lock / unlock.
    const handleVisibility = () => {
      if (!document.hidden && isActiveRef.current) {
        // Tab just became visible — check for gap
        catchUpIfNeeded()

        // Also verify the worker is still alive
        const elapsed = Date.now() - lastHeartbeatRef.current
        if (elapsed > HEARTBEAT_TIMEOUT) {
          restartWorker()
        }
      }
    }

    document.addEventListener('resume', handleResume)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('resume', handleResume)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [restartWorker, catchUpIfNeeded])

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  const startCollection = useCallback(() => {
    // Guard: if the worker is already running at this interval, skip
    if (isActiveRef.current && currentIntervalRef.current === intervalMinutes) {
      console.log('[CLIENT] Collection already active — skipping duplicate start')
      return
    }

    currentIntervalRef.current = intervalMinutes
    isActiveRef.current = true

    console.log(
      `🚀 [CLIENT] Starting reading collection via Web Worker (every ${intervalMinutes} min)`
    )

    setStatus((prev) => ({
      ...prev,
      isActive: true,
      intervalMinutes,
    }))

    // Silent AudioContext prevents Chrome from throttling this tab's
    // timers (including the Web Worker) while the tab is hidden.
    startAudioKeepalive()

    const worker = ensureWorker()
    worker?.postMessage({
      type: 'START',
      intervalMs: intervalMinutes * 60 * 1000,
    })

    startHeartbeatMonitor()
  }, [intervalMinutes, ensureWorker, startHeartbeatMonitor])

  const stopCollection = useCallback(() => {
    console.log('⏹️ Stopping client-side reading collection')
    isActiveRef.current = false

    workerRef.current?.postMessage({ type: 'STOP' })
    stopHeartbeatMonitor()
    stopAudioKeepalive()

    setStatus((prev) => ({ ...prev, isActive: false }))
  }, [stopHeartbeatMonitor])

  /**
   * Update the collection interval on-the-fly without a full restart.
   * Also re-registers the service-worker periodic sync so foreground and
   * background intervals stay in sync.
   */
  const updateInterval = useCallback((newMinutes: number) => {
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
  }, [])

  // ------------------------------------------------------------------
  // Cleanup – terminate the worker on unmount
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      stopHeartbeatMonitor()
      stopAudioKeepalive()
    }
  }, [stopHeartbeatMonitor])

  return {
    status,
    startCollection,
    stopCollection,
    collectReading,
    updateInterval,
  }
}
