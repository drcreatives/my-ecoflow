# Background Reading Collection

## Overview

The EcoFlow Dashboard uses a **client-driven hybrid** strategy to keep reading collection running as continuously as possible — even when the browser tab is hidden, minimized, or covered by another window. Because Vercel's free-tier cron is too limited for per-user collection frequencies, the system relies on client-side mechanisms backed by a service worker for best-effort background support.

## Architecture

### Collection Layers

| Layer | When it runs | Mechanism | File |
|---|---|---|---|
| **Web Worker timer** | Whenever the app is open (active *or* hidden tab) | Dedicated `Worker` with recursive `setTimeout` — immune to main-thread throttling | `public/collection-worker.js` |
| **Silent AudioContext keepalive** | While collection is active | Keeps Chrome from applying "intensive timer throttling" to the tab | `src/hooks/useClientSideReadingCollection.ts` |
| **Heartbeat monitor** | While collection is active | Main thread checks worker heartbeats every 45 s; auto-restarts dead workers | `src/hooks/useClientSideReadingCollection.ts` |
| **Web Lock** | While the worker timer is running | Holds `navigator.locks` as an additional hint against tab freezing | `public/collection-worker.js` |
| **localStorage persistence** | Always (survives freeze/discard) | Stores last collection timestamp; enables gap detection on resume | `src/hooks/useClientSideReadingCollection.ts` |
| **Catch-up on resume** | When tab becomes visible or resumes from freeze | Force-collects immediately if gap ≥ configured interval | `src/hooks/useClientSideReadingCollection.ts` |
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
  ├─ Silent AudioContext (1 Hz oscillator, gain = 0)
  │    └─ Prevents Chrome intensive timer throttling on hidden tabs
  │
  ├─ Heartbeat monitor (main thread, 45 s check)
  │    └─ If heartbeat missing > 90 s → terminate & recreate worker
  │
  ├─ visibilitychange / resume event handlers
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

1. **Silent AudioContext** — Chrome exempts tabs with a running `AudioContext` from ALL timer throttling. This is the same technique used by Discord, Google Meet, and Slack. The oscillator runs at 1 Hz with gain = 0, so it produces no audible output. Handles browser autoplay policy by deferring `ctx.resume()` to the first user interaction if needed.

2. **Web Worker** — Runs timer logic on a separate thread, immune to main-thread jank. Uses recursive `setTimeout` (chained) instead of `setInterval` — chained timeouts are processed differently by some browsers and can be more resilient.

3. **Web Lock** — `navigator.locks.request()` in the worker holds a lock for the duration of the timer. This is an additional signal to Chrome's tab lifecycle manager.

4. **Heartbeat + auto-restart** — The worker sends a heartbeat message every 30 s. The main thread checks every 45 s. If heartbeats are missing for > 90 s, the worker is terminated and recreated. This handles edge cases where Chrome freezes the worker despite AudioContext + Web Lock.

5. **localStorage timestamp** — `ecoflow:lastCollectionTs` is saved on each successful collection. Survives tab freeze, tab discard, and browser restart. Used by the catch-up logic to calculate the gap.

6. **Catch-up on resume** — Listens for `visibilitychange` (tab visible again) and `resume` (Chrome Page Lifecycle unfreezing). If the gap since last collection ≥ the configured interval, immediately calls the collection endpoint with `?force=true` to bypass the server-side interval check.

7. **Service Worker** — Best-effort background collection when the tab is closed. Periodic Background Sync repeats at the configured interval (Chromium only, requires site engagement). One-off Background Sync fires at least once when connectivity resumes.

## Key Files

| File | Purpose |
|---|---|
| `src/hooks/useClientSideReadingCollection.ts` | React hook: Web Worker management, AudioContext keepalive, heartbeat monitor, gap detection, catch-up |
| `public/collection-worker.js` | Web Worker: recursive setTimeout timer, Web Lock keepalive, heartbeat sender, drift detection |
| `public/sw.js` | Service Worker: `periodicsync` / `sync` event handlers, cookie-authenticated fetch to collection endpoint |
| `src/components/AuthWrapper.tsx` | Orchestrator: initializes collection on auth, wires `onCollectionSuccess` to refresh Zustand stores, registers SW, handles SW messages |
| `src/app/api/devices/collect-readings/self/route.ts` | Cookie-authenticated endpoint: collects readings for the authenticated user only, supports `?force=true` |
| `src/app/api/devices/latest-readings/route.ts` | Returns latest reading per device (used by store refresh after collection) |
| `src/stores/readingsStore.ts` | Zustand store: `fetchLatestForAllDevices()` merges new readings efficiently (single-pass) |

## Platform Limits & Caveats

- **Silent AudioContext** requires a user gesture before `resume()` on some browsers (autoplay policy). The hook adds one-time listeners for `click`, `keydown`, and `touchstart` to handle this automatically. After any user interaction with the dashboard, the AudioContext will be running.
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
4. **Drift detection**: If the Web Worker timer fires late, you'll see `[Worker] Timer drift detected` warnings in the console with the expected vs actual delay.
5. **Heartbeat monitor**: If the worker dies, you'll see `[CLIENT] Worker heartbeat missing for Xs — restarting` in the console.
6. **AudioContext**: Check `[Keepalive] Silent AudioContext started` in the console on startup. If autoplay policy blocks it, it will activate on first user interaction.

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
