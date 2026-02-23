# Background Reading Collection

## Overview

The EcoFlow Dashboard uses a **client-driven hybrid** strategy to keep reading collection running as continuously as possible — even when the browser tab is hidden, minimized, or covered by another window. Because Vercel's free-tier cron is too limited for per-user collection frequencies, the system relies on client-side mechanisms backed by a service worker for best-effort background support.

## Architecture

### Collection Layers

| Layer | When it runs | Mechanism | File |
|---|---|---|---|
| **AudioContext keepalive** | While collection is active | Non-silent 1 Hz oscillator (gain **0.001** ≈ −60 dBFS) makes Chrome classify the tab as "audible" → **exempt from ALL timer throttling** | `src/hooks/useClientSideReadingCollection.ts` |
| **Web Worker timer (v4)** | Whenever the app is open (active *or* hidden tab) | Dedicated `Worker` with recursive `setTimeout`; self-heals after severe drift (>3× interval) | `public/collection-worker.js` |
| **Main-thread backup timer** | While collection is active | Redundant `setInterval` on the main thread — fires even if the Worker dies (once/min under throttling at worst) | `src/hooks/useClientSideReadingCollection.ts` |
| **Heartbeat monitor** | While collection is active | Main thread checks worker heartbeats every 45 s; auto-restarts dead workers | `src/hooks/useClientSideReadingCollection.ts` |
| **Web Lock** | While the worker timer is running | Holds `navigator.locks` as an additional hint against tab freezing | `public/collection-worker.js` |
| **localStorage persistence** | Always (survives freeze/discard) | Stores last collection timestamp; enables gap detection on resume | `src/hooks/useClientSideReadingCollection.ts` |
| **Catch-up on resume** | `visibilitychange` / `focus` / `pageshow` / `resume` | Force-collects immediately if gap ≥ configured interval | `src/hooks/useClientSideReadingCollection.ts` |
| **Service Worker – Periodic Sync** | While PWA is installed and browser grants permission | `periodicsync` event (Chromium 80+ only) | `public/sw.js` |
| **Service Worker – One-off Sync** | Fallback when periodic sync is unavailable | `sync` event — fires when connectivity resumes | `public/sw.js` |

All layers call the same authenticated endpoint: **`POST /api/devices/collect-readings/self`** with `credentials: 'include'` so the user's session cookies are sent automatically.

### Data Flow

```
User tab open (even hidden/minimized)
  │
  ├─ Web Worker (collection-worker.js)
  │    ├─ Recursive setTimeout fires at configured interval
  │    ├─ Posts TICK message → hook calls /api/devices/collect-readings/self
  │    └─ Posts HEARTBEAT every 30 s → main thread monitors liveness
  │
  ├─ AudioContext keepalive (1 Hz oscillator, gain = 0.001)
  │    └─ Chrome detects non-zero audio → tab marked "audible" → exempt from ALL throttling
  │
  ├─ Heartbeat monitor (main thread, 45 s check)
  │    └─ If heartbeat missing > 90 s → terminate & recreate worker
  │
  ├─ Main-thread backup setInterval
  │    └─ Redundant timer; fires even if Worker dies (once/min under throttling)
  │
  ├─ visibilitychange / focus / pageshow / resume event handlers
  │    └─ Check localStorage gap → force-collect if stale
  │
  └─ Service Worker (sw.js)
       ├─ periodicsync "collect-readings" → POST /api/.../self
       └─ sync "collect-readings" (fallback) → POST /api/.../self
```

### Collection Interval

The interval is sourced from each user's `collection_interval_minutes` setting (configured in **Settings → Data Retention**). Available options: 1, 2, 5, 15, 30, and 60 minutes. The foreground collector and periodic sync both respect this value, with a minimum of 1 minute.

## Why Each Layer Exists

### Problem: Browser Timer Throttling

Browsers progressively throttle JavaScript timers in hidden tabs:

| Browser behavior | Impact |
|---|---|
| **Basic throttling** (all browsers) | `setInterval`/`setTimeout` on the main thread limited to ≥1 s in hidden tabs |
| **Intensive throttling** (Chrome 87+) | Hidden-tab timers limited to once per **60 seconds** after 5 min |
| **Web Worker throttling** (Chrome 108+) | Even Web Worker timers can be throttled in hidden tabs under memory pressure |
| **Page Lifecycle freeze** (Chrome) | After extended idle, Chrome may freeze the entire tab including all workers |

### Solution Stack

1. **AudioContext keepalive** — Chrome exempts tabs with a running `AudioContext` that produces **non-zero audio samples** from ALL timer throttling. This is the same technique used by Discord, Google Meet, and Slack. The oscillator runs at 1 Hz (far below the 20 Hz human hearing threshold and physically impossible for speakers to reproduce) with `gain = 0.001` (≈ −60 dBFS). Chrome's internal `AudioPowerMonitor` has a silence threshold around −72 dBFS (~0.00025 amplitude); a gain of 0.001 is well above this, so Chrome marks the tab "audible" and exempts it from ALL timer throttling — both main-thread and Web Worker. **Important**: `gain = 0` does NOT work — Chrome sees zero-amplitude samples as silence and still throttles. Handles browser autoplay policy by deferring `ctx.resume()` to the first user interaction if needed.

2. **Web Worker (v4)** — Runs timer logic on a separate thread, immune to main-thread jank. Uses recursive `setTimeout` (chained) instead of `setInterval`. Self-heals after severe drift: if a tick fires >3× later than expected (e.g. after the OS suspends and resumes), it resets the timer chain from scratch.

3. **Main-thread backup timer** — A redundant `setInterval` on the main thread at the same interval. If the Web Worker dies or gets frozen, this still fires. Under intensive throttling (if AudioContext somehow fails) it fires at most once per minute — which is infinitely better than no collections. The `isCollectingRef` guard prevents double-collection when both timers fire.

4. **Web Lock** — `navigator.locks.request()` in the worker holds a lock for the duration of the timer. This is an additional signal to Chrome's tab lifecycle manager.

5. **Heartbeat + auto-restart** — The worker sends a heartbeat message every 30 s. The main thread checks every 45 s. If heartbeats are missing for > 90 s, the worker is terminated and recreated. This handles edge cases where Chrome freezes the worker despite AudioContext + Web Lock.

6. **localStorage timestamp** — `ecoflow:lastCollectionTs` is saved on each successful collection. Survives tab freeze, tab discard, and browser restart. Used by the catch-up logic to calculate the gap.

7. **Catch-up on resume** — Listens for four events to maximize coverage:
   - `visibilitychange` — tab becomes visible again
   - `focus` — user clicks into the window (more reliable than visibilitychange for multi-window scenarios)
   - `pageshow` — page restored from bfcache (with `event.persisted` check)
   - `resume` — Chrome Page Lifecycle unfreezing
   
   If the gap since last collection ≥ the configured interval, immediately calls the collection endpoint with `?force=true` to bypass the server-side interval check.

8. **Service Worker** — Best-effort background collection when the tab is closed. Periodic Background Sync repeats at the configured interval (Chromium only, requires site engagement). One-off Background Sync fires at least once when connectivity resumes.

## Key Files

| File | Purpose |
|---|---|
| `src/hooks/useClientSideReadingCollection.ts` | React hook: Web Worker management, AudioContext keepalive (gain 0.001), main-thread backup timer, heartbeat monitor, gap detection, catch-up via 4 events |
| `public/collection-worker.js` | Web Worker v4: recursive setTimeout timer, Web Lock keepalive, heartbeat sender, drift detection with self-healing |
| `public/sw.js` | Service Worker: `periodicsync` / `sync` event handlers, cookie-authenticated fetch to collection endpoint |
| `src/components/AuthWrapper.tsx` | Orchestrator: initializes collection on auth, wires `onCollectionSuccess` to refresh Zustand stores, registers SW, handles SW messages |
| `src/app/api/devices/collect-readings/self/route.ts` | Cookie-authenticated endpoint: collects readings for the authenticated user only, supports `?force=true` |
| `src/app/api/devices/latest-readings/route.ts` | Returns latest reading per device (used by store refresh after collection) |
| `src/stores/readingsStore.ts` | Zustand store: `fetchLatestForAllDevices()` merges new readings efficiently (single-pass) |

## Platform Limits & Caveats

- **AudioContext keepalive** requires a user gesture before `resume()` on some browsers (autoplay policy). The hook adds one-time listeners for `click`, `keydown`, and `touchstart` (cleaned up via `AbortController`) to handle this automatically. After any user interaction with the dashboard, the AudioContext will be running. **The gain MUST be non-zero** (currently 0.001) — Chrome's `AudioPowerMonitor` treats zero-amplitude audio as silence and still throttles the tab.
- **Periodic Background Sync** is supported only in Chromium-based browsers (Chrome, Edge, Opera) and requires a sufficient *site engagement score*. Not supported in Firefox or Safari.
- **On iOS**, PWA service workers are aggressively suspended after a few seconds of inactivity. Background collection will not run reliably on iOS. The foreground collector still works when the PWA is open.
- **One-off `sync`** is also Chromium-only and fires when the device regains network connectivity — it does not repeat on a schedule.
- Browsers and operating systems may still **throttle or suspend** activity to save battery, especially on mobile. Collection is **best-effort** when the app is not visible.
- If neither service worker sync API is available, collection only happens while the tab/PWA is open.

## Verification & Debugging

### Manual Testing

1. **Hidden-tab collection**: Sign in → switch to another tab or minimize → wait for the configured interval → check browser console for `📊 [CLIENT] Collecting device reading...` and `✅ [CLIENT] Reading collection successful` logs.
2. **Service Worker**: DevTools → Application → Service Workers → confirm `sw.js` is registered and activated.
3. **Periodic Sync**: DevTools → Application → Periodic Background Sync → verify `collect-readings` tag is listed (Chrome only).
4. **Drift detection**: If the Web Worker timer fires late, you'll see `[Worker] Timer drift detected` warnings in the console with the expected vs actual delay. If drift exceeds 3× the interval, you'll see `[Worker] Severe drift ... self-healing` and the timer chain resets automatically.
5. **Heartbeat monitor**: If the worker dies, you'll see `[CLIENT] Worker heartbeat missing for Xs — restarting` in the console.
6. **AudioContext**: Check `[Keepalive] Silent AudioContext started — tab timer throttling disabled` in the console on startup. If autoplay policy blocks it, it will activate on first user interaction.
7. **Backup timer**: When the main-thread backup timer fires, you'll see `[BACKUP] Main-thread backup timer fired` in the console. This is normal redundancy — the `isCollectingRef` guard prevents double-collection.

### Debug Endpoints

- `POST /api/devices/collect-readings/self` — Collect readings for the authenticated user (respects interval)
- `POST /api/devices/collect-readings/self?force=true` — Force-collect regardless of interval
- `GET /api/devices/latest-readings` — View latest reading per device
- `GET /api/monitor-readings` — View collection monitoring data

### localStorage Keys

- `ecoflow:lastCollectionTs` — Epoch ms of the last successful collection (used for gap detection)

## Configuration

Collection interval is configured per-user in **Settings → Data Retention → Data Collection Interval**. Available options:

| Interval | Use case |
|---|---|
| 1 min | Maximum resolution, highest API usage |
| 2 min | High resolution |
| **5 min** (default) | Balanced |
| 15 min | Lower resolution, fewer API calls |
| 30 min | Minimal collection |
| 60 min | Battery monitoring only |

The interval is fetched from `GET /api/user/data-retention` on auth and passed to both the Web Worker and service worker periodic sync registration.
