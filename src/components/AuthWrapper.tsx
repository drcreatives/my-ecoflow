'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { User } from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'
import { useClientSideReadingCollection } from '@/hooks/useClientSideReadingCollection'
import { useDeviceStore } from '@/stores/deviceStore'

interface AuthWrapperProps {
  children: React.ReactNode
  redirectTo?: string
}

// Default collection interval (minutes) used until user settings load
const DEFAULT_COLLECTION_INTERVAL = 5
// Minimum interval the service-worker periodic-sync will accept (minutes)
const MIN_PERIODIC_SYNC_INTERVAL = 1

// Global state to persist auth across navigations
let globalAuthState: {
  user: User | null
  initialized: boolean
  devicesLoaded: boolean
  collectionStarted: boolean
  swRegistered: boolean
  collectionInterval: number
} = {
  user: null,
  initialized: false,
  devicesLoaded: false,
  collectionStarted: false,
  swRegistered: false,
  collectionInterval: DEFAULT_COLLECTION_INTERVAL,
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

/** Register the service worker and attempt Periodic Background Sync. */
async function registerServiceWorker(intervalMinutes: number) {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    console.log('[SW] Service worker registered', reg.scope)

    // Wait until SW is active
    const sw = reg.active ?? reg.installing ?? reg.waiting
    if (sw && sw.state !== 'activated') {
      await new Promise<void>((resolve) => {
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated') resolve()
        })
      })
    }

    // Attempt periodicSync first (Chrome-only for now)
    const periodicSyncInterval =
      Math.max(intervalMinutes, MIN_PERIODIC_SYNC_INTERVAL) * 60 * 1000

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

    // Fallback: one-off Background Sync (fires when network becomes available)
    if ('sync' in reg) {
      try {
        // @ts-expect-error sync API may not be typed
        await reg.sync.register('collect-readings')
        console.log('[SW] One-off background sync registered')
      } catch (err) {
        console.warn('[SW] Background sync registration failed', err)
      }
    }
  } catch (err) {
    console.error('Service worker registration failed:', err)
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
  const initializationRef = useRef(false)

  // Collector with the current interval (defaults to cached value)
  const { startCollection, updateInterval } = useClientSideReadingCollection(
    globalAuthState.collectionInterval
  )

  /** Shared post-auth initializer: devices, reading collection, SW. */
  const initializePostAuth = useCallback(async () => {
    // Devices
    if (!globalAuthState.devicesLoaded && devices.length === 0) {
      console.log('Loading devices...')
      await fetchDevices()
      globalAuthState.devicesLoaded = true
    }

    // Fetch user interval setting
    const interval = await fetchCollectionInterval()
    globalAuthState.collectionInterval = interval

    // Start / update foreground collector
    if (!globalAuthState.collectionStarted) {
      console.log(
        `Starting reading collection (interval ${interval} min)...`
      )
      updateInterval(interval)
      startCollection()
      globalAuthState.collectionStarted = true
    } else {
      // Interval may have changed since last init
      updateInterval(interval)
    }

    // Register SW (idempotent)
    if (!globalAuthState.swRegistered) {
      await registerServiceWorker(interval)
      globalAuthState.swRegistered = true
    }
  }, [devices.length, fetchDevices, startCollection, updateInterval])

  useEffect(() => {
    if (initializationRef.current) return

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
          globalAuthState = {
            user: null,
            initialized: true,
            devicesLoaded: false,
            collectionStarted: false,
            swRegistered: false,
            collectionInterval: DEFAULT_COLLECTION_INTERVAL,
          }
          router.push(redirectTo)
          return
        }
      } catch (error) {
        console.error('Auth check error:', error)
        globalAuthState = {
          user: null,
          initialized: true,
          devicesLoaded: false,
          collectionStarted: false,
          swRegistered: false,
          collectionInterval: DEFAULT_COLLECTION_INTERVAL,
        }
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
        globalAuthState = {
          user: null,
          initialized: true,
          devicesLoaded: false,
          collectionStarted: false,
          swRegistered: false,
          collectionInterval: DEFAULT_COLLECTION_INTERVAL,
        }
        router.push(redirectTo)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [router, redirectTo, supabase.auth, initializePostAuth])

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
