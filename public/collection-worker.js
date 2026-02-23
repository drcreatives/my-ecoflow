// ---------------------------------------------------------------------------
// EcoFlow Dashboard – Collection Timer Worker  (v4)
// ---------------------------------------------------------------------------
// A dedicated Web Worker that provides a reliable timer for reading collection.
//
// Why a Web Worker?
// -----------------
// Browsers aggressively throttle `setInterval` / `setTimeout` on the main
// thread when a tab is hidden.  Web Workers run in their own thread and are
// largely immune to this — BUT Chrome can still throttle/freeze workers
// associated with hidden tabs under memory/CPU pressure.
//
// To combat this we:
//   1. Hold a Web Lock ('ecoflow-collection-keepalive') for the lifetime of
//      the timer.  An active lock hints Chrome to NOT freeze the tab.
//   2. Use recursive setTimeout (chained) instead of setInterval — chained
//      timeouts are processed differently by some browsers and can be more
//      resilient to throttling edge cases.
//   3. Send periodic HEARTBEAT messages (every 30 s) so the main thread can
//      detect if the worker was suspended and restart it.
//   4. Self-monitor: detect when a tick fires significantly later than
//      expected (drift) and self-heal by resetting the timer chain.
//
// The main thread also starts a non-silent AudioContext which is the primary
// throttle-prevention mechanism (Chrome exempts "audible" tabs from all
// timer throttling).
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
let lastTickTime = 0

const HEARTBEAT_INTERVAL = 30_000 // 30 seconds
// If a tick fires more than 50% late, log a drift warning
const DRIFT_WARN_FACTOR = 1.5
// If a tick fires more than 3x late, the timer chain may be broken — self-heal
const DRIFT_RESET_FACTOR = 3

// ---------------------------------------------------------------------------
// Web Lock keepalive
// ---------------------------------------------------------------------------
function acquireKeepaliveLock() {
  if (lockHeld) return
  if (typeof navigator !== 'undefined' && navigator.locks) {
    navigator.locks.request(
      'ecoflow-collection-keepalive',
      { mode: 'exclusive', ifAvailable: false },
      () =>
        new Promise((resolve) => {
          self._releaseLock = resolve
        })
    ).catch(() => {})
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
  // Use recursive setTimeout for heartbeats too
  function beat() {
    self.postMessage({ type: 'HEARTBEAT', timestamp: Date.now() })
    heartbeatId = setTimeout(beat, HEARTBEAT_INTERVAL)
  }
  beat()
}

function stopHeartbeat() {
  if (heartbeatId !== null) {
    clearTimeout(heartbeatId)
    heartbeatId = null
  }
}

// ---------------------------------------------------------------------------
// Timer – recursive setTimeout (more resilient than setInterval)
// ---------------------------------------------------------------------------
function scheduleTick() {
  timerId = setTimeout(() => {
    const now = Date.now()

    // Drift detection: warn if this tick is much later than expected
    if (lastTickTime > 0) {
      const elapsed = now - lastTickTime
      if (elapsed > intervalMs * DRIFT_RESET_FACTOR) {
        // Severe drift — the timer chain was likely frozen then resumed.
        // Self-heal: emit the tick and restart the chain cleanly.
        console.warn(
          `[Worker] Severe drift: expected ${intervalMs}ms, got ${elapsed}ms — self-healing`
        )
        lastTickTime = now
        self.postMessage({ type: 'TICK' })
        // Clear and re-schedule from scratch
        if (timerId !== null) clearTimeout(timerId)
        scheduleTick()
        return
      }
      if (elapsed > intervalMs * DRIFT_WARN_FACTOR) {
        console.warn(
          `[Worker] Timer drift detected: expected ${intervalMs}ms, got ${elapsed}ms (${Math.round(elapsed / intervalMs * 100)}%)`
        )
      }
    }

    lastTickTime = now
    self.postMessage({ type: 'TICK' })

    // Chain the next tick
    scheduleTick()
  }, intervalMs)
}

function startTimer() {
  stopTimer()
  acquireKeepaliveLock()
  startHeartbeat()

  // Immediate first tick
  lastTickTime = Date.now()
  self.postMessage({ type: 'TICK' })

  // Schedule subsequent ticks via recursive setTimeout
  scheduleTick()
}

function stopTimer() {
  if (timerId !== null) {
    clearTimeout(timerId)
    timerId = null
  }
  lastTickTime = 0
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
