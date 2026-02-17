# Background Reading Collection

## How It Works

The EcoFlow Dashboard uses a **client-driven hybrid** strategy to keep reading collection running as continuously as possible:

| Layer | When it runs | Mechanism |
|---|---|---|
| **Foreground interval** | Whenever the app is open (active *or* hidden tab) | `setInterval` in `useClientSideReadingCollection` — no longer pauses on hidden tabs |
| **Periodic Background Sync** | While the PWA is installed and the browser grants permission | Service worker `periodicsync` event (Chrome 80+) |
| **One-off Background Sync** | Fallback when periodic sync is unavailable | Service worker `sync` event — fires at least once when connectivity resumes |

All three layers call the same authenticated endpoint (`POST /api/devices/collect-readings/self`) with `credentials: 'include'` so the user's session cookies are sent automatically.

### Collection Interval

The interval is sourced from each user's `collection_interval_minutes` setting (configured in **Settings → Data Retention**). The foreground collector and periodic sync both respect this value, with a minimum of 1 minute.

## Platform Limits & Caveats

- **Periodic Background Sync** is currently supported only in Chromium-based browsers (Chrome, Edge, Opera) and requires a sufficient *site engagement score*. It is **not** supported in Firefox or Safari.
- Browsers and operating systems may **throttle or suspend** service worker activity to save battery, especially on mobile. Collection is therefore **best-effort** when the app is not in the foreground.
- On iOS, **PWA service workers are aggressively suspended** after a few seconds of inactivity. Background collection will not run reliably on iOS even when installed as a PWA.
- The one-off `sync` event is also Chromium-only and fires when the device regains network connectivity — it does not repeat on a schedule.
- If neither sync API is available, collection only happens while the tab/app is open.

## Verification

1. **Hidden-tab collection**: sign in, switch to another tab, wait for the configured interval, then check the browser console or server logs for collection activity.
2. **Service worker**: open DevTools → Application → Service Workers and confirm `sw.js` is registered and activated.
3. **Periodic sync**: in DevTools → Application → Periodic Background Sync, verify the `collect-readings` tag is listed (Chrome only).
4. **Debug endpoint**: `POST /api/devices/collect-readings/self?force=true` will force a collection regardless of interval.
