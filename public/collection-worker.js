// ---------------------------------------------------------------------------
// EcoFlow Dashboard – Collection Timer Worker
// ---------------------------------------------------------------------------
// A dedicated Web Worker that provides a reliable timer for reading collection.
//
// Why a Web Worker?
// -----------------
// Browsers aggressively throttle `setInterval` / `setTimeout` on the main
// thread when a tab is hidden (Chrome limits to 1/min after 5 min, and may
// fully suspend timers after extended periods).  Web Workers run in their
// own thread and are NOT subject to these restrictions, making them ideal
// for background-interval tasks while the page is still open.
//
// Protocol (postMessage):
//   → { type: 'START',           intervalMs: number }
//   → { type: 'STOP' }
//   → { type: 'UPDATE_INTERVAL', intervalMs: number }
//   ← { type: 'TICK' }
// ---------------------------------------------------------------------------

let timerId = null
let intervalMs = 5 * 60 * 1000 // default 5 min

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

function startTimer() {
  stopTimer()
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
}
