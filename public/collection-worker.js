// ---------------------------------------------------------------------------
// EcoFlow Dashboard – Collection Timer Worker  (v2)
// ---------------------------------------------------------------------------
// A dedicated Web Worker that provides a reliable timer for reading collection.
//
// Why a Web Worker?
// -----------------
// Browsers aggressively throttle `setInterval` / `setTimeout` on the main
// thread when a tab is hidden.  Web Workers run in their own thread and are
// largely immune to this — BUT Chrome can still "freeze" the entire tab
// (including its workers) after extended idle via the Page Lifecycle API.
//
// To combat this we:
//   1. Hold a Web Lock ('ecoflow-collection-keepalive') for the lifetime of
//      the timer.  An active lock hints Chrome to NOT freeze the tab.
//   2. Send periodic HEARTBEAT messages (every 30 s) so the main thread can
//      detect if the worker was suspended and restart it.
//
// Protocol (postMessage):
//   → { type: 'START',           intervalMs: number }
//   → { type: 'STOP' }
//   → { type: 'UPDATE_INTERVAL', intervalMs: number }
//   ← { type: 'TICK' }
//   ← { type: 'HEARTBEAT',      timestamp: number }
// ---------------------------------------------------------------------------

let timerId = null
let heartbeatId = null
let intervalMs = 5 * 60 * 1000 // default 5 min
let lockHeld = false

const HEARTBEAT_INTERVAL = 30_000 // 30 seconds

// ---------------------------------------------------------------------------
// Web Lock keepalive
// ---------------------------------------------------------------------------
// navigator.locks is available inside workers in Chrome 69+.
// Holding a lock prevents the tab from being frozen by Chrome's lifecycle.
function acquireKeepaliveLock() {
  if (lockHeld) return
  if (typeof navigator !== 'undefined' && navigator.locks) {
    navigator.locks.request(
      'ecoflow-collection-keepalive',
      { mode: 'exclusive', ifAvailable: false },
      () =>
        // Return a promise that never resolves — keeps the lock held
        // until the worker is terminated or STOP is called.
        new Promise((resolve) => {
          self._releaseLock = resolve
        })
    ).catch(() => {
      // Web Locks unavailable or rejected — not critical
    })
    lockHeld = true
  }
}

function releaseKeepaliveLock() {
  if (self._releaseLock) {
    self._releaseLock()
    self._releaseLock = null
  }
  lockHeld = false
}

// ---------------------------------------------------------------------------
// Heartbeat — lets the main thread detect if the worker was frozen
// ---------------------------------------------------------------------------
function startHeartbeat() {
  stopHeartbeat()
  heartbeatId = setInterval(() => {
    self.postMessage({ type: 'HEARTBEAT', timestamp: Date.now() })
  }, HEARTBEAT_INTERVAL)
}

function stopHeartbeat() {
  if (heartbeatId !== null) {
    clearInterval(heartbeatId)
    heartbeatId = null
  }
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------
function startTimer() {
  stopTimer()
  acquireKeepaliveLock()
  startHeartbeat()
  // Immediate first tick
  self.postMessage({ type: 'TICK' })
  timerId = setInterval(() => {
    self.postMessage({ type: 'TICK' })
  }, intervalMs)
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }
  stopHeartbeat()
  releaseKeepaliveLock()
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
self.onmessage = (event) => {
  const { type, intervalMs: newInterval } = event.data

  switch (type) {
    case 'START':
      if (typeof newInterval === 'number' && newInterval > 0) {
        intervalMs = newInterval
      }
      startTimer()
      break

    case 'STOP':
      stopTimer()
      break

    case 'UPDATE_INTERVAL':
      if (typeof newInterval === 'number' && newInterval > 0) {
        intervalMs = newInterval
      }
      // Restart only if already running
      if (timerId !== null) {
        stopTimer()
        startTimer()
      }
      break

    default:
      break
  }
}
