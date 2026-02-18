'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { useClientSideReadingCollection } from '@/hooks/useClientSideReadingCollection'
import { useDeviceStore } from '@/stores/deviceStore'
import { useReadingsStore } from '@/stores/readingsStore'

interface AuthWrapperProps {
  children: React.ReactNode
  redirectTo?: string
}

// Default collection interval (minutes) used until user settings load
const DEFAULT_COLLECTION_INTERVAL = 5
// Minimum interval the service-worker periodic-sync will accept (minutes)
const MIN_PERIODIC_SYNC_INTERVAL = 1
// How long to wait for SW activation before giving up (ms)
const SW_ACTIVATION_TIMEOUT = 10_000
// Minimum elapsed ms before a visibility-change triggers a store refresh.
// Prevents unnecessary fetches when the user Alt-Tabs quickly.
const VISIBILITY_REFRESH_THRESHOLD = 30_000 // 30 seconds

// Global state to persist auth across SPA navigations
let globalAuthState: {
  user: User | null
  initialized: boolean
  devicesLoaded: boolean
  collectionStarted: boolean
  swRegistered: boolean
  collectionInterval: number
  /** Epoch ms of the last successful store refresh (collection or visibility). */
  lastStoreRefresh: number
} = {
  user: null,
  initialized: false,
  devicesLoaded: false,
  collectionStarted: false,
  swRegistered: false,
  collectionInterval: DEFAULT_COLLECTION_INTERVAL,
  lastStoreRefresh: 0,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fetch the authenticated user's collection_interval_minutes from the API. */
async function fetchCollectionInterval(): Promise<number> {
  try {
    const res = await fetch('/api/user/data-retention', { credentials: 'include' })
    if (!res.ok) return DEFAULT_COLLECTION_INTERVAL
    const json = await res.json()
    const minutes = json?.settings?.collection_interval_minutes
    return typeof minutes === 'number' && minutes >= 1 ? minutes : DEFAULT_COLLECTION_INTERVAL
  } catch {
    return DEFAULT_COLLECTION_INTERVAL
  }
}

/** Register periodic sync (or one-off sync) on an active SW registration. */
async function registerSyncOnRegistration(
  reg: ServiceWorkerRegistration,
  intervalMinutes: number
) {
  const periodicSyncInterval =
    Math.max(intervalMinutes, MIN_PERIODIC_SYNC_INTERVAL) * 60 * 1000

  // Attempt periodicSync first (Chromium-only)
  if ('periodicSync' in reg) {
    try {
      const status = await navigator.permissions.query({
        // @ts-expect-error periodicSync permission name is not in lib.dom.d.ts yet
        name: 'periodic-background-sync',
      })
      if (status.state === 'granted') {
        // @ts-expect-error periodicSync API not in lib.dom.d.ts yet
        await reg.periodicSync.register('collect-readings', {
          minInterval: periodicSyncInterval,
        })
        console.log(
          `[SW] Periodic sync registered (min interval ${intervalMinutes} min)`
        )
        return
      }
    } catch (err) {
      console.warn(
        '[SW] Periodic sync not available, falling back to one-off sync',
        err
      )
    }
  }

  // Fallback: one-off Background Sync
  if ('sync' in reg) {
    try {
      // @ts-expect-error sync API may not be typed
      await reg.sync.register('collect-readings')
      console.log('[SW] One-off background sync registered')
    } catch (err) {
      console.warn('[SW] Background sync registration failed', err)
    }
  }
}

/** Register the service worker, wait for activation, set up sync + updates. */
async function registerServiceWorker(intervalMinutes: number) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    console.log('[SW] Service worker registered', reg.scope)

    // --- Wait until SW is active (with timeout + redundant guard) --------
    const sw = reg.active ?? reg.installing ?? reg.waiting
    if (sw && sw.state !== 'activated') {
      try {
        await Promise.race([
          new Promise<void>((resolve, reject) => {
            const onStateChange = () => {
              if (sw.state === 'activated') {
                sw.removeEventListener('statechange', onStateChange)
                resolve()
              } else if (sw.state === 'redundant') {
                sw.removeEventListener('statechange', onStateChange)
                reject(new Error('Service worker became redundant before activation'))
              }
            }
            sw.addEventListener('statechange', onStateChange)
          }),
          new Promise<void>((_, reject) =>
            setTimeout(
              () => reject(new Error('Service worker activation timeout')),
              SW_ACTIVATION_TIMEOUT
            )
          ),
        ])
      } catch (err) {
        console.warn('[SW] Activation wait failed, continuing anyway:', err)
      }
    }

    // --- Handle SW updates ------------------------------------------------
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[SW] New version available, activating...')
          newWorker.postMessage({ type: 'SKIP_WAITING' })
        }
      })
    })

    // --- Register sync ----------------------------------------------------
    await registerSyncOnRegistration(reg, intervalMinutes)
  } catch (err) {
    console.error('Service worker registration failed:', err)
  }
}

/** Unregister all service workers (called on sign-out). */
async function unregisterServiceWorkers() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    for (const registration of registrations) {
      await registration.unregister()
    }
    console.log('[SW] All service workers unregistered')
  } catch (err) {
    console.warn('Failed to unregister service workers on sign-out', err)
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AuthWrapper({
  children,
  redirectTo = '/login',
}: AuthWrapperProps) {
  const [user, setUser] = useState<User | null>(globalAuthState.user)
  const [loading, setLoading] = useState(!globalAuthState.initialized)
  const router = useRouter()
  const supabase = createClient()
  const { fetchDevices, devices } = useDeviceStore()
  const { fetchLatestForAllDevices } = useReadingsStore()
  const initializationRef = useRef(false)
  const hiddenSinceRef = useRef<number | null>(null)
  const isRefreshingRef = useRef(false)

  // ------------------------------------------------------------------
  // Store refresh helper — called after every collection and on
  // visibility-change.  Debounced via globalAuthState.lastStoreRefresh.
  // ------------------------------------------------------------------
  const refreshStores = useCallback(async () => {
    // Skip if a refresh is already in flight
    if (isRefreshingRef.current) return
    const now = Date.now()
    // Skip if we refreshed very recently (< 10 s)
    if (now - globalAuthState.lastStoreRefresh < 10_000) return

    isRefreshingRef.current = true
    globalAuthState.lastStoreRefresh = now
    console.log('[AuthWrapper] Refreshing stores with latest data...')
    try {
      await Promise.all([
        fetchDevices(),
        fetchLatestForAllDevices(),
      ])
    } catch (err) {
      console.warn('[AuthWrapper] Store refresh error:', err)
    } finally {
      isRefreshingRef.current = false
    }
  }, [fetchDevices, fetchLatestForAllDevices])

  // Stable ref so callbacks/effects always see the latest version
  const refreshStoresRef = useRef(refreshStores)
  useEffect(() => { refreshStoresRef.current = refreshStores }, [refreshStores])

  // ------------------------------------------------------------------
  // Hook: collection with Web Worker + store refresh callback
  // ------------------------------------------------------------------
  const { startCollection, updateInterval } = useClientSideReadingCollection({
    intervalMinutes: globalAuthState.collectionInterval,
    onCollectionSuccess: useCallback(() => {
      // Fire-and-forget store refresh after each successful collection
      refreshStoresRef.current()
    }, []),
  })

  // Stable refs so the main useEffect doesn't re-run when these change
  const startCollectionRef = useRef(startCollection)
  const updateIntervalRef = useRef(updateInterval)
  const fetchDevicesRef = useRef(fetchDevices)
  const devicesLengthRef = useRef(devices.length)

  useEffect(() => { startCollectionRef.current = startCollection }, [startCollection])
  useEffect(() => { updateIntervalRef.current = updateInterval }, [updateInterval])
  useEffect(() => { fetchDevicesRef.current = fetchDevices }, [fetchDevices])
  useEffect(() => { devicesLengthRef.current = devices.length }, [devices.length])

  // ------------------------------------------------------------------
  // Listen for SW messages (READING_COLLECTED, AUTH_EXPIRED)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'READING_COLLECTED') {
        console.log('[SW→Client] Background collection completed:', event.data.summary)
        // Refresh stores so the UI shows the data collected by the SW
        refreshStoresRef.current()
      }

      if (event.data?.type === 'AUTH_EXPIRED') {
        console.warn('[SW→Client] Auth expired, session may need refresh')
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [])

  // ------------------------------------------------------------------
  // Visibility-change handler: refresh stores when the user returns
  // to the tab after being away for VISIBILITY_REFRESH_THRESHOLD ms.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (typeof document === 'undefined') return

    const handleVisibility = () => {
      if (document.hidden) {
        // Record when the tab went hidden
        hiddenSinceRef.current = Date.now()
      } else {
        // Tab is visible again
        if (
          hiddenSinceRef.current &&
          Date.now() - hiddenSinceRef.current >= VISIBILITY_REFRESH_THRESHOLD &&
          globalAuthState.initialized &&
          globalAuthState.user
        ) {
          console.log('[AuthWrapper] Tab visible again after ≥30 s — refreshing stores')
          refreshStoresRef.current()
        }
        hiddenSinceRef.current = null
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  // ------------------------------------------------------------------
  // Main auth + initialization effect
  // ------------------------------------------------------------------
  useEffect(() => {
    if (initializationRef.current) return

    /** Shared post-auth initializer: devices, reading collection, SW. */
    const initializePostAuth = async () => {
      // Devices
      if (!globalAuthState.devicesLoaded && devicesLengthRef.current === 0) {
        console.log('Loading devices...')
        await fetchDevicesRef.current()
        globalAuthState.devicesLoaded = true
      }

      // Fetch user interval setting
      const interval = await fetchCollectionInterval()
      globalAuthState.collectionInterval = interval

      // Start / update foreground collector (Web Worker driven)
      if (!globalAuthState.collectionStarted) {
        console.log(`Starting reading collection (interval ${interval} min)...`)
        updateIntervalRef.current(interval)
        startCollectionRef.current()
        globalAuthState.collectionStarted = true
      } else {
        updateIntervalRef.current(interval)
      }

      // Register SW (idempotent)
      if (!globalAuthState.swRegistered) {
        await registerServiceWorker(interval)
        globalAuthState.swRegistered = true
      }

      // Initial store refresh (loads latest readings into Zustand)
      refreshStoresRef.current()
    }

    const resetGlobalState = () => {
      globalAuthState = {
        user: null,
        initialized: true,
        devicesLoaded: false,
        collectionStarted: false,
        swRegistered: false,
        collectionInterval: DEFAULT_COLLECTION_INTERVAL,
        lastStoreRefresh: 0,
      }
    }

    const checkAuth = async () => {
      try {
        if (globalAuthState.initialized && globalAuthState.user) {
          console.log('Using cached auth state')
          setUser(globalAuthState.user)
          setLoading(false)
          await initializePostAuth()
          return
        }

        console.log('Performing initial auth check...')
        initializationRef.current = true

        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (session?.user) {
          console.log('User authenticated')
          setUser(session.user)
          globalAuthState.user = session.user
          globalAuthState.initialized = true

          await initializePostAuth()
        } else {
          console.log('No valid session - redirecting')
          resetGlobalState()
          router.push(redirectTo)
          return
        }
      } catch (error) {
        console.error('Auth check error:', error)
        resetGlobalState()
        router.push(redirectTo)
        return
      } finally {
        setLoading(false)
        initializationRef.current = false
      }
    }

    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event)

      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        globalAuthState.user = session.user
        globalAuthState.initialized = true
        await initializePostAuth()
      } else if (event === 'SIGNED_OUT') {
        console.log('Signed out - resetting state')
        setUser(null)
        resetGlobalState()

        // Unregister SW so it stops making auth-failing requests
        await unregisterServiceWorkers()

        router.push(redirectTo)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
    // Stable deps only — refs keep the functions current without re-running
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, redirectTo, supabase.auth])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto mb-4" />
          <p className="text-text-muted">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}
