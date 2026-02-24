## Plan: Migrate EcoFlow Dashboard from Supabase to Convex

Replace Supabase (auth + Postgres + limited cron) with Convex (built-in auth, reactive database, unlimited cron jobs on free tier). This eliminates the complex client-side background collection system — Convex cron jobs run server-side at whatever interval we need, calling the EcoFlow API directly. The migration is a full cutover: build the complete Convex backend, migrate data, switch the frontend, then remove Supabase. ~30 files touch Supabase auth, ~33 use `executeQuery`, and 11 database tables need Convex schemas. The EcoFlow API wrapper ([src/lib/ecoflow-api.ts](src/lib/ecoflow-api.ts)) needs zero changes.

**Steps**

### Phase 0: Setup & Infrastructure
1. Install Convex and initialize the project: `npm install convex @convex-dev/auth @auth/core@0.37.0`, then `npx convex dev` to create a deployment. This creates the `convex/` directory and `.env.local` with `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`.
2. Set up the Convex MCP server in VS Code — add to `.vscode/mcp.json`:
   ```json
   { "servers": { "convex": { "type": "stdio", "command": "npx", "args": ["-y", "convex@latest", "mcp", "start", "--project-dir", "."] } } }
   ```
3. Set EcoFlow API keys as Convex environment variables via `npx convex env set ECOFLOW_ACCESS_KEY <key>` and `npx convex env set ECOFLOW_SECRET_KEY <key>`. Same for `RESEND_API_KEY`.

### Phase 1: Convex Schema & Auth
4. Define the Convex schema in `convex/schema.ts` with all 11 tables mapped from the current Prisma/migration schema:
   - `users` — `email`, `firstName`, `lastName`, `createdAt`, `updatedAt` (+ Convex Auth's `authTables`)
   - `devices` — `userId` (reference to users), `deviceSn`, `deviceName`, `deviceType`, `isActive`, `createdAt`, `updatedAt`
   - `deviceReadings` — `deviceId` (reference to devices), `batteryLevel`, `inputWatts`, `acInputWatts`, `dcInputWatts`, `chargingType`, `outputWatts`, `acOutputWatts`, `dcOutputWatts`, `usbOutputWatts`, `remainingTime`, `temperature`, `status`, `rawData`, `recordedAt` — indexed on `(deviceId, recordedAt)`
   - `deviceSettings` — `deviceId`, `settingKey`, `settingValue`, `updatedAt`
   - `dailySummaries` — `deviceId`, `date`, metrics
   - `alerts` — `deviceId`, `type`, `title`, `message`, `severity`, `isRead`, `createdAt`
   - `dataRetentionSettings` — `userId`, `retentionPeriodDays`, `autoCleanupEnabled`, `backupEnabled`, `collectionIntervalMinutes`, `lastCleanup`
   - `notificationSettings` — `userId`, all notification preference fields
   - `notificationLogs` — `userId`, `type`, `email`, `deviceId`, `subject`, `messageId`, `status`, `errorMessage`, `sentAt`
   - `sessionSettings` — `userId`, timeout/logout fields
   - `passwordChangeLog` — `userId`, `changedAt`, `ipAddress`, `userAgent`
5. Set up Convex Auth with email/password:
   - Run `npx @convex-dev/auth` initialization
   - Configure Password provider in `convex/auth.ts`
   - Spread `...authTables` into `convex/schema.ts`
   - Create `convex/auth.config.ts` with the Password provider
6. Create `ConvexClientProvider` component wrapping `ConvexAuthProvider` in place of the current Supabase provider — wire into [src/app/layout.tsx](src/app/layout.tsx).

### Phase 2: Convex Backend Functions (queries, mutations, actions)
7. Create `convex/users.ts` — queries/mutations for user profile CRUD, replacing [src/app/api/user/profile/route.ts](src/app/api/user/profile/route.ts).
8. Create `convex/devices.ts` — queries/mutations for device CRUD (list, get, create, update, delete), replacing [src/app/api/devices/route.ts](src/app/api/devices/route.ts) and [src/app/api/devices/[deviceId]/route.ts](src/app/api/devices/%5BdeviceId%5D/route.ts).
9. Create `convex/readings.ts` — queries for reading history (with time-bucket aggregation), latest readings per device, and mutations for inserting readings. Replaces [src/app/api/history/readings/route.ts](src/app/api/history/readings/route.ts), [src/app/api/devices/latest-readings/route.ts](src/app/api/devices/latest-readings/route.ts).
10. Create `convex/ecoflow.ts` — **action** (with `"use node"` for crypto) that calls the EcoFlow API via the existing [src/lib/ecoflow-api.ts](src/lib/ecoflow-api.ts) logic, transforms responses, and calls a mutation to insert readings. This is the core collection action.
11. Create `convex/settings.ts` — queries/mutations for `dataRetentionSettings`, `notificationSettings`, `sessionSettings`. Replaces [src/app/api/user/data-retention/route.ts](src/app/api/user/data-retention/route.ts), [src/app/api/user/notifications/route.ts](src/app/api/user/notifications/route.ts), [src/app/api/user/session-settings/route.ts](src/app/api/user/session-settings/route.ts).
12. Create `convex/email.ts` — action for sending emails via Resend. Replaces [src/lib/email-simple.ts](src/lib/email-simple.ts) and [src/app/api/email/](src/app/api/email/) routes.
13. Create `convex/admin.ts` — mutation for data cleanup (delete readings older than retention period). Replaces [src/app/api/admin/data-cleanup/route.ts](src/app/api/admin/data-cleanup/route.ts).

### Phase 3: Cron Jobs (THE KEY WIN)
14. Create `convex/crons.ts` — this is **the primary reason for the migration**:
    - `crons.interval("collect-readings", { minutes: 1 }, internal.ecoflow.collectAllUserReadings)` — server-side cron that runs the EcoFlow action for ALL users. Checks each user's `collectionIntervalMinutes` setting to decide whether to actually collect (allowing per-user intervals without needing multiple cron jobs). No more client-side Worker, AudioContext hacks, or background sync complexity.
    - `crons.interval("data-cleanup", { hours: 24 }, internal.admin.cleanupOldReadings)` — daily cleanup per retention settings.
    - `crons.interval("device-monitor", { minutes: 15 }, internal.devices.checkDeviceAlerts)` — periodic alert checking.
    - **No cron limit on Convex's free tier** — you get 1M function calls/month, which is more than enough for 1-minute collection intervals (~43,200 calls/month for cron + collection mutations).

### Phase 4: Frontend Migration
15. Rewrite `authStore` in [src/stores/authStore.ts](src/stores/authStore.ts) — replace all `supabase.auth.*` calls with Convex Auth hooks (`useConvexAuth`, `useQuery` for user data). The Convex Auth library provides `Authenticated`, `Unauthenticated`, and `AuthLoading` components.
16. Rewrite [src/components/AuthWrapper.tsx](src/components/AuthWrapper.tsx) — replace Supabase session logic with `useConvexAuth()`. **Remove all background collection orchestration** (Web Worker startup, AudioContext keepalive, SW registration, interval fetching) — this is now server-side via cron. Keep only the Zustand store initialization.
17. Rewrite [src/app/login/page.tsx](src/app/login/page.tsx) — replace `supabase.auth.signInWithPassword` / `signUp` with Convex Auth sign-in/sign-up flows (same email/password UI, different backend calls).
18. Update [src/components/LogoutButton.tsx](src/components/LogoutButton.tsx) — replace `supabase.auth.signOut()` with Convex Auth signout.
19. Rewrite [middleware.ts](middleware.ts) — replace Supabase session refresh with Convex Auth middleware (or simplify to a client-side redirect since Convex Auth handles sessions differently — Next.js middleware support is experimental in Convex Auth, so we may use a simpler client-side auth gate pattern via `AuthWrapper`).
20. Update all Zustand stores that call API endpoints — `deviceStore`, `readingsStore`, `userStore` — to use Convex's `useQuery`/`useMutation` hooks instead of `fetch()` to Next.js API routes. This gives **real-time reactivity** for free (readings update automatically when the cron inserts new data).
21. Update all page components to use Convex hooks:
    - [src/app/(dashboard)/dashboard/page.tsx](src/app/(dashboard)/dashboard/page.tsx) — `useQuery(api.readings.latest)`
    - [src/app/(dashboard)/devices/page.tsx](src/app/(dashboard)/devices/page.tsx) — `useQuery(api.devices.list)`
    - [src/app/(dashboard)/history/page.tsx](src/app/(dashboard)/history/page.tsx) — `useQuery(api.readings.history)`
    - [src/app/(dashboard)/analytics/page.tsx](src/app/(dashboard)/analytics/page.tsx) — `useQuery(api.readings.analytics)`
    - [src/app/(dashboard)/settings/page.tsx](src/app/(dashboard)/settings/page.tsx) — `useQuery`/`useMutation` for all settings
    - [src/app/(dashboard)/device/[deviceId]/](src/app/(dashboard)/device/) pages

### Phase 5: Data Migration
22. Export data from Supabase:
    - Use `pg_dump` or Supabase dashboard to export all tables as JSON/CSV
    - Export: `users`, `devices`, `device_readings`, `device_settings`, `data_retention_settings`, `notification_settings`, `session_settings`
23. Create a one-time Convex migration action in `convex/migrations.ts`:
    - Register you as a user via Convex Auth (new password — Supabase password hashes are not exportable)
    - Import devices with your new Convex user ID
    - Import device readings, mapping the old device UUIDs to new Convex `_id` values
    - Import all settings tables with the new user ID
24. Run the migration action, verify data counts match

### Phase 6: Cleanup
25. **Delete all client-side background collection code**:
    - [src/hooks/useClientSideReadingCollection.ts](src/hooks/useClientSideReadingCollection.ts) — entire file
    - [src/hooks/useAutomaticReadingCollection.ts](src/hooks/useAutomaticReadingCollection.ts) — entire file
    - [public/collection-worker.js](public/collection-worker.js) — Web Worker
    - [public/sw.js](public/sw.js) — Service Worker
    - [src/components/ReadingCollector.tsx](src/components/ReadingCollector.tsx) — collector component
    - [src/components/CronStatusWidget.tsx](src/components/CronStatusWidget.tsx) — rewrite to show Convex cron status instead
    - All AudioContext/Web Lock/heartbeat code in AuthWrapper
26. **Delete all Supabase/DB files**:
    - [src/lib/supabase.ts](src/lib/supabase.ts), [src/lib/supabase-server.ts](src/lib/supabase-server.ts), [src/lib/database.ts](src/lib/database.ts), [src/lib/prisma.ts](src/lib/prisma.ts)
    - [prisma/schema.prisma](prisma/schema.prisma)
27. **Delete all Next.js API routes** — Convex functions replace them entirely:
    - All routes under `src/app/api/` (auth, devices, readings, history, user, admin, cron, email, monitor, test-*, debug-*)
    - The `api/` directory can be removed completely (or kept only for webhooks if needed)
28. **Remove Supabase/Prisma NPM packages**: `@supabase/ssr`, `@supabase/supabase-js`, `@prisma/client`, `prisma`, `pg`, `@types/pg`
29. **Remove Supabase env vars** from `.env.local` and Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
30. Update [BACKGROUND_COLLECTION.md](BACKGROUND_COLLECTION.md), [README.md](README.md), and [.github/copilot-instructions.md](.github/copilot-instructions.md) to reflect the new Convex architecture — the background collection doc shrinks dramatically since it's now just "Convex cron job runs every N minutes server-side."

### Phase 7: Testing & Deployment
31. Run `npx convex dev` and verify all functions deploy successfully
32. Test auth flow: sign up, sign in, sign out
33. Test cron collection: verify readings appear automatically every interval
34. Test all dashboard pages: devices, history, analytics, settings
35. Verify real-time reactivity: readings should appear on the dashboard within seconds of cron execution, without manual refresh
36. Deploy to Vercel with `npx convex deploy --cmd 'npm run build'`

**Verification**
- `npx convex dev` — functions compile and deploy to dev
- `npm run build` — Next.js production build succeeds
- Manual: sign in → see dashboard → wait for cron interval → readings appear automatically (no page refresh needed — Convex reactivity)
- Manual: change collection interval in Settings → cron respects the new interval on next tick
- Convex Dashboard → Cron Jobs tab → verify `collect-readings` executes on schedule
- Data integrity: compare reading counts between old Supabase export and new Convex tables

**Decisions**
- Use a client-driven hybrid (foreground interval + service worker background sync) because Vercel's free cron is too limited for per-user frequency → **REPLACED BY**: Server-side Convex cron jobs with no frequency limits on free tier.
- Enforce user-scoped collection with auth cookies to meet the "authenticated" requirement while allowing service-worker fetches → **REPLACED BY**: Convex actions run server-side with direct DB access, no cookie auth needed.
- **Convex Auth (email/password)**: Simplest migration path, eliminates external auth dependency. Existing user re-registers with new password (password hashes are non-exportable from Supabase).
- **Server-side cron replaces ALL client-side collection**: The entire AudioContext/Web Worker/Service Worker/heartbeat/Web Lock stack gets deleted. Convex cron runs reliably regardless of whether any browser tab is open.
- **Full cutover**: Build everything in Convex first, migrate data, switch. Cleaner than incremental — avoids running two backends simultaneously.
- **Convex reactive queries replace polling/fetch**: Dashboard components use `useQuery()` which auto-updates when cron inserts new readings. No more manual store refreshes or `onCollectionSuccess` callbacks.
- **Next.js API routes eliminated**: Convex functions replace all ~50 API routes. Frontend calls Convex directly via typed hooks.
- **Per-user interval**: The cron runs at a fixed base interval (e.g. every minute) and checks each user's `collectionIntervalMinutes` setting to decide whether to actually collect. This lets different users have different intervals without needing multiple cron jobs.
