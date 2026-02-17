// ---------------------------------------------------------------------------
// EcoFlow Dashboard – Service Worker
// ---------------------------------------------------------------------------
// Provides best-effort background reading collection via the Background Sync
// and Periodic Background Sync APIs.  Falls back gracefully when neither API
// is available (the foreground interval collector handles that case).
//
// This file lives in /public so it is served from the site root, giving it
// scope over all pages.
// ---------------------------------------------------------------------------

const COLLECT_ENDPOINT = '/api/devices/collect-readings/self'
const SYNC_TAG = 'collect-readings'

// ---------------------------------------------------------------------------
// Install & Activate
// ---------------------------------------------------------------------------
self.addEventListener('install', () => {
  console.log('[SW] Installing service worker')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Service worker activated')
  event.waitUntil(self.clients.claim())
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
      // Throwing causes the sync manager to retry later
      if (response.status >= 500) {
        throw new Error(`Server error ${response.status}`)
      }
      return // 4xx – don't retry
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
