## Plan: Background Collection for PWA

The current client collector intentionally pauses on hidden tabs, and there is no service worker to run background sync. Strong, always-on collection is not feasible purely client-side when the app is closed or the OS suspends the PWA; the best we can do is a best‑effort background strategy plus a foreground collector that no longer pauses on hidden tabs. Given your free Vercel cron limits, the plan focuses on a client‑driven hybrid: keep collecting when the app is open (even hidden), and add a service worker with Background Sync/Periodic Sync where supported. We will also align the interval with the user’s `collection_interval_minutes` setting and tighten the API to only collect for the authenticated user (via cookies), so background calls still respect auth.

**Steps**
1. Update the client collector to remove the visibility‑pause behavior and to accept a dynamic interval sourced from user settings; wire it in [src/components/AuthWrapper.tsx](src/components/AuthWrapper.tsx) and adjust `useClientSideReadingCollection` in [src/hooks/useClientSideReadingCollection.ts](src/hooks/useClientSideReadingCollection.ts) to take a configurable interval and a background policy flag.
2. Add a small client utility to fetch the user’s `collection_interval_minutes` from your existing data retention endpoint and store it (Zustand or local state); use it to initialize the collector in [src/components/AuthWrapper.tsx](src/components/AuthWrapper.tsx).
3. Register a service worker after auth in [src/components/AuthWrapper.tsx](src/components/AuthWrapper.tsx) or [src/app/layout.tsx](src/app/layout.tsx). On registration, attempt `periodicSync.register()` with the user’s interval (with a sane minimum) and fall back to one‑off `sync` if periodic sync is unavailable.
4. Create a service worker at [public/sw.js](public/sw.js) to listen for `periodicsync` and `sync` events and call a user‑scoped collection endpoint with `credentials: 'include'`, so it can use auth cookies.
5. Add a user‑scoped API route (or tighten the existing one) to only collect for the authenticated user based on cookies; use `createServerSupabaseClient` and return 401 if unauthenticated. Implement in [src/app/api/devices/collect-readings/route.ts](src/app/api/devices/collect-readings/route.ts) or a new route in [src/app/api/devices/collect-readings/self/route.ts](src/app/api/devices/collect-readings/self/route.ts).
6. Document platform limits in a short note (README or a small UI hint) that background collection is best‑effort and depends on OS/browser support and power management.
7. After each successful step, run TypeScript validation with `npm run type-check` and record any follow-up fixes needed for that step.
8. After each step is validated, create a git commit with a focused message summarizing the step (one step per commit).

**Verification**
- Manual: sign in, switch tabs, lock screen, and observe that collections continue while the app is open (hidden tab) via logs and API responses.
- Manual: install the PWA and verify `periodicSync` registration success/fallback; confirm service worker fetches the endpoint (network panel or server logs).
- Optional: add a quick debug endpoint to report last collection time and verify it updates while hidden.

**Decisions**
- Use a client‑driven hybrid (foreground interval + service worker background sync) because Vercel’s free cron is too limited for per‑user frequency.
- Enforce user‑scoped collection with auth cookies to meet the “authenticated” requirement while allowing service‑worker fetches.
