// ---------------------------------------------------------------------------
// EcoFlow Dashboard – Service Worker  (v1)
// ---------------------------------------------------------------------------
// Provides best-effort background reading collection via the Background Sync
// and Periodic Background Sync APIs.  Falls back gracefully when neither API
// is available (the foreground interval collector handles that case).
//
// This file lives in /public so it is served from the site root, giving it
// scope over all pages.  Bump the version comment above when deploying
// changes so browsers detect the update.
// ---------------------------------------------------------------------------

const SW_VERSION = '1.0.0'
const COLLECT_ENDPOINT = '/api/devices/collect-readings/self'
const SYNC_TAG = 'collect-readings'

// ---------------------------------------------------------------------------
// Install & Activate
// ---------------------------------------------------------------------------
self.addEventListener('install', () => {
  console.log(`[SW v${SW_VERSION}] Installing service worker`)
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log(`[SW v${SW_VERSION}] Service worker activated`)
  event.waitUntil(self.clients.claim())
})

// Handle SKIP_WAITING message from the client when a new version is found
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// ---------------------------------------------------------------------------
// Periodic Background Sync  (Chrome 80+, requires site engagement score)
// ---------------------------------------------------------------------------
self.addEventListener('periodicsync', (event) => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] Periodic sync: collecting readings')
    event.waitUntil(collectReadings())
  }
})

// ---------------------------------------------------------------------------
// One-off Background Sync  (wider support – Chrome, Edge, Opera)
// ---------------------------------------------------------------------------
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    console.log('[SW] Background sync: collecting readings')
    event.waitUntil(collectReadings())
  }
})

// ---------------------------------------------------------------------------
// Collection helper
// ---------------------------------------------------------------------------
async function collectReadings() {
  try {
    const response = await fetch(COLLECT_ENDPOINT, {
      method: 'POST',
      credentials: 'include', // send auth cookies
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      console.warn(`[SW] Collection returned HTTP ${response.status}`)

      // 401/403 – session expired or user signed out; notify clients so the
      // foreground app can prompt re-authentication if needed.
      if (response.status === 401 || response.status === 403) {
        const clients = await self.clients.matchAll({ type: 'window' })
        for (const client of clients) {
          client.postMessage({
            type: 'AUTH_EXPIRED',
            status: response.status,
          })
        }
        return // don't retry auth failures
      }

      // 5xx – let SyncManager retry later
      if (response.status >= 500) {
        throw new Error(`Server error ${response.status}`)
      }

      return // other 4xx – don't retry
    }

    const data = await response.json()
    console.log('[SW] Collection successful', data.summary)

    // Notify any open clients about the successful collection
    const clients = await self.clients.matchAll({ type: 'window' })
    for (const client of clients) {
      client.postMessage({
        type: 'READING_COLLECTED',
        timestamp: new Date().toISOString(),
        summary: data.summary,
      })
    }
  } catch (error) {
    console.error('[SW] Collection failed:', error)
    throw error // let SyncManager retry
  }
}
