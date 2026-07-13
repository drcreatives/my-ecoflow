# MEMORY.md

Living repository memory for future coding sessions. This is a factual snapshot, not a substitute for reading the source.

**Last devoted update:** 2026-07-13  
**Evidence reviewed:** current source/configuration, git history/status, `README.md`, `BACKGROUND_COLLECTION.md`, and all guidance under `.github/`.

## Product snapshot

My EcoFlow is a dark, responsive dashboard for monitoring and controlling EcoFlow Delta 2 power stations. It provides live battery/power/temperature status, historical analytics, device registration, control/configuration, scheduled commands, retention settings, alerts, email notifications, and JSON email backups.

The deployed shape is:

```text
Browser / Next.js 15 App Router
  -> Convex Auth + reactive queries/actions
Convex Cloud
  -> database and ownership checks
  -> cron jobs and schedule engine
  -> EcoFlow REST API (HMAC-SHA256)
  -> Resend email
```

There are no application API routes. Supabase survives only in one-time migration scripts/data and stale documentation. Vercel serves the frontend; Convex Cloud runs the backend.

## Current stack

- Next.js `15.5.20`, React `19.1`, TypeScript 5, App Router, Turbopack
- Convex `1.32` with `@convex-dev/auth` password authentication
- Tailwind CSS v4 with tokens in `src/app/globals.css`
- Zustand for UI-only state
- Recharts for charts
- Formik + Yup for forms
- Sonner for toasts
- Resend for email and backup delivery
- Vitest + React Testing Library, Playwright, Husky, and lint-staged

## Current source map

### Routes

- `/`: client-side auth-aware redirect
- `/login`: sign-in/sign-up
- `/dashboard`: overview and device cards
- `/devices`: searchable/filterable device list
- `/devices/add`: EcoFlow discovery and registration
- `/device/[deviceId]`: device detail and quick controls
- `/device/[deviceId]/settings`: full configuration and schedules
- `/history`: readings table, charts, filters, and export
- `/analytics`: energy and battery analytics
- `/settings`: profile, notifications, retention/backup, session, and export UI

All dashboard routes share `AuthWrapper` and `AppLayout`. `middleware.ts` is intentionally inactive (`matcher: []`).

### Convex modules

| Module | Current role |
|---|---|
| `schema.ts` | 12 application tables plus Convex auth tables |
| `auth.ts`, `auth.config.ts`, `http.ts` | Password auth and auth HTTP routes |
| `users.ts` | Profile read/update |
| `devices.ts`, `devices_internal.ts` | Owned device CRUD, alert scan, internal device lookup |
| `readings.ts` | Latest/history/count queries, aggregation/summary, insert and optimistic patch helpers |
| `ecoflow.ts` | Signing, discovery, collection, refresh, and all device SET actions |
| `settings.ts` | Retention, collection, backup, notification, and session settings |
| `schedules.ts`, `schedules_internal.ts` | Owned CRUD and timezone-aware minute scheduler |
| `admin.ts` | Retention cleanup |
| `backup.ts`, `backup_queries.ts` | Seven-day JSON backup creation and Resend delivery |
| `email.ts`, `email_log.ts` | Alert/test email delivery and logging |
| `crons.ts` | Five scheduled jobs |
| `migrations.ts` | One-time Supabase-to-Convex import |

### Application tables

`users`, `devices`, `deviceReadings`, `deviceSettings`, `dailySummaries`, `alerts`, `dataRetentionSettings`, `notificationSettings`, `notificationLogs`, `sessionSettings`, `passwordChangeLog`, and `deviceSchedules`.

Important indexes include device ownership (`devices.by_userId`), latest/range readings (`deviceReadings.by_deviceId_recordedAt`), per-user settings, and device/user schedule lookups.

### Scheduled work

| Job | Cadence | Function |
|---|---:|---|
| `collect-readings` | 1 minute | `ecoflow.collectAllUserReadings` |
| `device-monitor` | 15 minutes | `devices.checkDeviceAlerts` |
| `data-cleanup` | 24 hours | `admin.cleanupOldReadings` |
| `backup-check` | 1 hour | `backup.checkAndRunBackups` |
| `process-schedules` | 1 minute | `schedules_internal.processSchedules` |

The collection cron is only a tick: each user's `collectionIntervalMinutes` determines whether an actual EcoFlow request occurs. `DISABLE_CRONS=true` suppresses development-side collection, monitoring, cleanup, backup, and schedule processing.

## Durable decisions and invariants

### Data and auth

- Convex is the sole live backend and authentication provider.
- Normal public backend operations authenticate and enforce ownership. Client auth redirects are presentation only. The legacy public `migrations.runMigration` action additionally requires a deployment-side one-time `MIGRATION_SECRET`; remove or rotate it after migration use.
- Reactive Convex data is server state. Zustand must remain UI-only.
- Pages generally consume `src/hooks/useConvexData.ts`, which maps Convex documents into compatibility shapes expected by older UI code.
- Convex IDs remain typed as `Id<"table">` at backend boundaries. Timestamps are epoch milliseconds in storage.

### Collection and refresh

- Background collection is server-side and browser-independent.
- New readings are pushed through Convex reactivity; there is no normal client polling loop.
- `useOnDemandRefresh` refreshes on focus, visibility, and navigation, with a two-minute client cooldown. The server independently skips fresh devices using the same approximate staleness threshold.
- Device detail/settings routes refresh only that device; other routes may refresh all owned devices.
- `readings.history` caps future end times to now, uses the compound index, limits rows adaptively, reads newest records first, reverses to chronological order, then aggregates.

### EcoFlow integration

- Base URL is `https://api-e.ecoflow.com`.
- Requests use HMAC-SHA256 over alphabetically sorted parameters. Nested SET bodies are flattened before signing.
- `/iot-open/sign/device/quota/all?sn=...` deliberately excludes `sn` from the signature payload.
- `convex/ecoflow.ts` is the live implementation. `src/lib/ecoflow-api.ts` is retained legacy/server code and is not the frontend data path.
- SET commands use numeric module types and protocol-specific operation names. Several operations reject partial payloads, so unchanged sibling values are loaded from the latest reading and resent.
- Successful quick controls can patch the latest reading optimistically, then schedule a quota refresh after roughly five seconds.
- Charging status is based on net power flow, with signed `pd.remainTime` preferred as the firmware signal. The fallback uses `inputWatts - outputWatts` with a ±10 W deadband.
- Stored `remainingTime`: positive = until full, negative = until empty.
- Buzzer terminology is dangerous: EcoFlow exposes silent/quiet mode while the UI presents buzzer enabled. Re-verify inversion end-to-end whenever touching it.

### Schedules

- At most five schedules are allowed per device.
- Time is strict `HH:MM`; days use `0=Sunday` through `6=Saturday`; an empty array means every day.
- Each schedule stores an IANA timezone and a generic EcoFlow action payload.
- The minute cron computes local time with `Intl.DateTimeFormat`, checks day/time, prevents duplicate execution in the same local minute, and ignores inactive/missing devices.

### UI and visual language

- Dark theme only; Neue Montreal is loaded locally.
- Tailwind v4 has no `tailwind.config.ts`; semantic tokens are declared in `globals.css`.
- Core palette: base `#151615`, surface 1 `#1f201f`, surface 2 `#242624`, primary green `#44af21`, secondary green `#00c356`, tertiary blue `#3a6fe3`.
- Cards use an 18 px radius, inner controls 12 px, and pills fully rounded.
- Shared primitives live in `src/components/ui`; chart tokens live in `src/lib/chart-theme.ts`.
- Mobile touch targets, safe-area handling, iOS input sizing, and global focus-visible styles are intentional.

## Current working state on 2026-07-13

The working tree already contained user-owned, uncommitted changes before `AGENTS.md` and this file were created:

- `convex/schema.ts`: adds `deviceReadings.acChargingPaused`.
- `convex/readings.ts`: reads the latest AC charging pause state for control payload construction.
- `convex/ecoflow.ts`: extracts/preserves charging pause state while constructing AC charging commands and reuses current energy config for complete SET payloads.
- `src/app/(dashboard)/device/[deviceId]/settings/page.tsx`: hardens the DC charging-current slider commit and removes an unused ref.

Do not overwrite, revert, stage, or claim the original user changes without explicit user direction. During engineering standardization, `acChargingPaused` was completed across insertion, collection/refresh, optimistic patching, query return shapes, and frontend types. Re-run `git status --short` at the start of every session because this section will age.

Recent committed work leading into this state added full device control/schedules, on-demand refresh, optimistic control state, correct required SET parameter groups, buzzer semantic fixes, and a DC input-current slider.

## Known debt and sharp edges

1. The initial 16-test baseline covers protocol helpers, migration authorization, formatting, and two UI primitives, but does not yet cover Convex database handlers, schedules, page flows, or E2E behavior.
2. E2E infrastructure is configured but requires an appropriate running/authenticated environment and still has no committed E2E scenarios.
3. README and Copilot architecture counts were synchronized to 12 application tables and five cron jobs; keep them updated with schema/job changes.
4. The settings page contains a TODO for password changes with Convex Auth.
5. `src/lib/ecoflow-api.ts` duplicates protocol logic from the Convex action module and includes development TLS bypass behavior. Avoid expanding this duplication.
6. Several large page modules exceed 500 lines, and device settings exceeds 1,000 lines. Prefer targeted extraction when adding substantial behavior, but do not refactor them incidentally.
7. Type shapes are duplicated between `src/types/index.ts`, `src/lib/data-utils.ts`, Convex return objects, and bridge hooks. Schema field additions can easily be missed in one layer.
8. Some legacy `any` usages remain, notably UI compatibility code. Avoid introducing more.
9. `.github/hooks/pre-commit-lint.json` is a Copilot hook definition, not proof that every local Git client runs those checks; Husky is the repository-wide local gate.
10. `scripts/supabase-export.json` is checked in and may contain sensitive migrated data/device identifiers. Do not print or modify it casually.
11. Comments/field names around `buzzerSilent` have historically drifted from UI semantics. Trust verified behavior and protocol docs, not a single label.
12. `migrations.runMigration` remains public for the legacy script, although it is now guarded by `MIGRATION_SECRET`. Prefer internalizing or deleting the migration surface once it is no longer needed.
13. `npm audit` reports two moderate PostCSS advisories nested under Next.js. The remaining automatic remedy proposes a breaking/invalid Next downgrade, so it was not forced; reassess during the next framework upgrade.

Current quality baseline at this update: `npm run type-check` passes; all 16 tests pass; `npm run lint` has a ceiling of 48 existing warnings and zero errors. The warnings are chiefly legacy `any`, unused imports/variables, the anonymous auth-config export, and two generated JavaScript eslint directives. Reduce the ceiling whenever warnings are repaired; the target is zero.

Committed Husky hooks are installed through `npm install`/`prepare`: pre-commit runs lint-staged and pre-push runs lint, type-check, all Vitest projects, and a production build. Git's `--no-verify` escape hatch must be exceptional and disclosed.

## Environment contract

Do not record values here. Active variable names inferred from the runtime are:

### Local/Next.js

- `NEXT_PUBLIC_CONVEX_URL`
- `CONVEX_DEPLOYMENT` (Convex CLI/deployment selection)
- `CI` for Playwright behavior

### Convex deployment

- `CONVEX_SITE_URL` for auth provider configuration
- `ECOFLOW_ACCESS_KEY`
- `ECOFLOW_SECRET_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_APP_URL` (optional; email links have a production fallback)
- `DISABLE_CRONS` (optional; use `"true"` in development when appropriate)
- `MIGRATION_SECRET` (temporary; legacy migration authorization only)

The migration exporter additionally reads `DATABASE_URL`, but that belongs to one-time legacy migration tooling.

## Commands and verification reality

```bash
npm run dev            # Next dev server with Turbopack
npm run build          # Production build
npm run lint           # ESLint
npm run type-check     # tsc --noEmit
npm run test           # all Vitest projects
npm run test:backend   # convex/__tests__/**/*.test.ts
npm run test:frontend  # src/**/*.test.{ts,tsx}
npm run test:e2e       # Playwright, expects localhost:3000
npm run verify         # pre-push gate: lint, types, tests, build
npm run verify:full    # verify plus Playwright E2E
npx convex dev         # deploy/watch development Convex functions
npx convex deploy      # production Convex deployment; explicit authorization required
```

Node 18+ is documented as the minimum. `package-lock.json` is authoritative for npm installs.

## How to update this memory devotedly

Update this file in the same change whenever any of the following changes:

- product scope, framework/backend/auth provider, deployment shape, or data flow;
- route, Convex module, table, index, cron, or environment-variable contract;
- EcoFlow signing, quota transformation, command semantics, refresh/optimistic-update flow, or physical-device safety rule;
- testing commands, actual test coverage, build/lint behavior, or commit gates;
- a known debt item is fixed, replaced, or newly discovered;
- significant active work is left uncommitted for the next agent.

Maintenance procedure:

1. Re-read the changed source and relevant `.github` instruction/reference files.
2. Verify facts with `rg`, `package.json`, `convex/schema.ts`, `convex/crons.ts`, and `git status --short` rather than copying older prose.
3. Change the **Last devoted update** date.
4. Move resolved debt out instead of accumulating historical clutter.
5. Keep secrets, personal data, deployment IDs, and real serial numbers out of this file.
6. Keep this as a concise current-state handoff; use Git history for archaeology.
