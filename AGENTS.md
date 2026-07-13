# AGENTS.md

This file is the working contract for coding agents in this repository. It applies to the whole repository unless a more specific `AGENTS.md` is added below a directory.

## Mission

Maintain and extend the EcoFlow Delta 2 dashboard without weakening authentication, ownership checks, EcoFlow command correctness, Convex reactivity, or the existing dark design system.

The application is a Next.js 15 App Router frontend backed directly by Convex. Convex owns authentication, persistence, server-side EcoFlow API calls, scheduled jobs, alerts, backups, and device schedules. There are no application Next.js API routes and no active Supabase runtime.

## Instruction precedence and sources of truth

1. Follow the user's request and system/developer instructions.
2. Follow this file.
3. Apply the scoped rules in `.github/instructions/` when they match the files being changed.
4. Use `.github/copilot-instructions.md`, `.github/prompts/`, `README.md`, and `BACKGROUND_COLLECTION.md` as useful context, but verify their claims against current code.
5. For EcoFlow protocol details, consult `.github/EcoFlow Developer.txt` and the working request/signing code in `convex/ecoflow.ts`.

Current code and configuration win when documentation disagrees. Known stale facts are tracked in `MEMORY.md`.

## Start every task this way

- Read `AGENTS.md` and `MEMORY.md`.
- Run `git status --short` and preserve all pre-existing work. Never discard, reset, overwrite, or reformat unrelated changes.
- Inspect the relevant source, its callers, its Convex schema/validators, and nearby documentation before editing.
- Check `.github/instructions/convex-patterns.instructions.md` for `convex/**/*.ts` work and `.github/instructions/testing-and-commits.instructions.md` for implementation work.
- Use `rg`/`rg --files` for discovery. Do not search `.next`, `node_modules`, generated output, or secrets unless the task requires it.
- Do not read or expose environment-variable values. It is safe to inspect variable names and `.env.example`.
- Do not start another development server merely to inspect the project. Reuse an existing server if one is already running.

## Repository map

| Path | Responsibility |
|---|---|
| `src/app/` | Next.js App Router pages and layouts |
| `src/app/(dashboard)/` | Authenticated dashboard routes |
| `src/components/` | Shared layout, controls, charts, auth, and UI primitives |
| `src/hooks/useConvexData.ts` | Main compatibility/bridge layer for reactive Convex data and actions |
| `src/hooks/useOnDemandRefresh.ts` | Focus/navigation/manual refresh with a two-minute cooldown |
| `src/lib/` | Formatting, chart theme, class utilities, and a legacy/server API wrapper |
| `src/stores/uiStore.ts` | Zustand UI-only state; do not put server data here |
| `src/types/` | Shared application types |
| `convex/schema.ts` | Convex application tables and indexes |
| `convex/*.ts` | Public and internal queries, mutations, actions, auth, and crons |
| `convex/_generated/` | Convex-generated code; never edit by hand |
| `scripts/` | One-time Supabase export/migration tooling, not application runtime |
| `.github/instructions/` | Scoped implementation rules |
| `.github/hooks/` | Copilot pre-commit lint/type-check hook definition |
| `.github/prompts/` | Historical plans and reusable prompts |
| `.github/EcoFlow Developer.txt` | Checked-in EcoFlow protocol reference |

## Architecture invariants

### Convex is the backend

- Keep database access, external EcoFlow calls, scheduled collection, alerts, email, backups, and schedule execution in Convex.
- Do not introduce a Next.js API route or a second persistence/auth layer without an explicit architectural decision.
- Convex reactive queries are the primary server-state mechanism. Zustand is only for ephemeral UI concerns such as sidebar state and notifications.
- Prefer the bridge hooks in `src/hooks/useConvexData.ts` for pages and components. Direct Convex hooks are acceptable for auth/provider code, the specialized refresh hook, or capabilities the bridge intentionally does not expose.
- Auth gating in the browser is performed by `AuthWrapper`; `middleware.ts` is intentionally a no-op. Browser gating never replaces backend authorization.

### Convex function rules

- Every public query, mutation, and action must authenticate with `auth.getUserId(ctx)`.
- `migrations.runMigration` is a legacy public action protected by a temporary `MIGRATION_SECRET`. Do not invoke it casually; remove or rotate the secret after migration work and never weaken this guard.
- Unauthorized public queries return a shape-compatible empty value (`[]`, `null`, or an empty result object). Unauthorized mutations/actions throw `new Error("Unauthorized")`.
- After authentication, verify resource ownership before reading, changing, deleting, refreshing, or controlling a device or schedule. Do not rely on possession of a Convex ID or serial number.
- Internal functions are callable only by trusted backend code and do not require public auth guards.
- Validate every argument with Convex validators. Use `v.id("table")` for document references, not `v.string()`.
- Use schema indexes for filtered reads. Add the needed index in `convex/schema.ts` rather than replacing it with an unbounded filter/collect pattern.
- Map documents to deliberate client-facing shapes. Do not leak `_id`, `_creationTime`, `userId`, raw API payloads, or credentials unless the caller genuinely needs them.
- Convex optional fields often become `null` at the client boundary. Preserve the established `?? null` / `?? undefined` conventions deliberately.
- Store timestamps as epoch milliseconds. Convert at UI/export boundaries.
- Put `"use node";` at the top only in actions that require Node APIs or Node-only packages.
- Keep one domain per module and use the existing section-comment organization.
- Schema changes must be propagated through validators, insert/patch paths, query return shapes, frontend types/hooks, and UI consumers. Regenerate Convex types with `npx convex dev --once` when the change requires it and an appropriate deployment is configured.

### Current data and job model

`convex/schema.ts` currently defines 12 application tables in addition to `authTables`: `users`, `devices`, `deviceReadings`, `deviceSettings`, `dailySummaries`, `alerts`, `dataRetentionSettings`, `notificationSettings`, `notificationLogs`, `sessionSettings`, `passwordChangeLog`, and `deviceSchedules`.

`convex/crons.ts` currently defines five jobs:

- `collect-readings`: every minute; individual user collection intervals are enforced inside the action.
- `device-monitor`: every 15 minutes.
- `data-cleanup`: every 24 hours.
- `backup-check`: every hour.
- `process-schedules`: every minute.

Cron implementations honor `DISABLE_CRONS=true`; preserve that guard for expensive or externally visible development work.

### EcoFlow API correctness

Treat device-control changes as high-risk integration work.

- Use `https://api-e.ecoflow.com`, not `https://api.ecoflow.com`.
- Keep credentials and HMAC-SHA256 signing server-side. Never move EcoFlow keys into `NEXT_PUBLIC_*` variables or client code.
- Signature parameters are sorted. Nested SET payload parameters are flattened for signing.
- The quota-all request includes `sn` in the URL but excludes it from the signature payload. Preserve this special case.
- The authoritative runtime implementation is in `convex/ecoflow.ts`. `src/lib/ecoflow-api.ts` is a retained older wrapper and must not silently diverge into a second runtime path.
- Consult `.github/EcoFlow Developer.txt` before adding or changing `moduleType`, `operateType`, units, ranges, or inverted boolean semantics.
- Some SET operations require a complete parameter group even when the UI changes only one field. Read the current config and send all required sibling parameters for operations such as `acChgCfg`, `watthConfig`, `acAutoOutConfig`, and AC output configuration.
- On a successful control action, follow the established sequence where applicable: send SET, optimistically patch the latest reading, then schedule a delayed authoritative refresh. Do not optimistically patch before the remote command succeeds.
- `remainingTime` is signed: positive means time until full; negative means time remaining until empty. Charging/discharging uses the sign of `pd.remainTime` when available, with net input minus output and a ±10 W deadband as fallback. Simultaneous input and output is normal.
- Be especially careful with buzzer/silent-mode fields: API names and UI meaning are inverted in places. Verify the protocol reference, transform, stored field, action, and label together.

### Reading-query and bandwidth constraints

- Keep `readings.history` bounded and indexed. It caps the effective end time, applies adaptive row limits, reads newest-first, then restores chronological order for charts.
- Avoid fresh `Date.now()` values on every React render when they feed a reactive Convex query. Memoize or retain time windows as the existing hooks do.
- On-demand refresh is client- and server-rate-limited around a two-minute staleness window. Preserve route-aware single-device refresh on `/device/[id]` pages.
- Background collection is server-side. Do not add browser timers, service workers, Web Workers, wake locks, or polling loops to duplicate the Convex cron.

## Frontend conventions

- Next.js uses the App Router. Add `'use client'` only where browser APIs, state, effects, event handlers, or client hooks require it.
- Components use PascalCase and explicit props interfaces. Hooks use the `use` prefix.
- Use `@/` for imports rooted at `src/`. Existing Convex generated imports are relative because `convex/` is outside `src/`.
- Preserve the route group and authenticated shell: root decides `/login` versus `/dashboard`; `(dashboard)/layout.tsx` wraps pages in `AuthWrapper` and `AppLayout`.
- Use Formik/Yup where a page already uses them. Use Sonner for user-visible action feedback.
- Prefer accessible roles, labels, keyboard behavior, focus states, and minimum touch targets. Test behavior rather than DOM implementation details.
- Do not use `any` as a shortcut. Some legacy `any` remains; improve it locally when safe, but avoid broad unrelated refactors.

### Design system

- The product is dark-theme only and uses Neue Montreal from `public/fonts/`.
- Tailwind CSS v4 tokens live in the `@theme` block in `src/app/globals.css`. There is no `tailwind.config.ts`.
- Reuse semantic tokens (`bg-bg-base`, `bg-surface-1`, `text-text-primary`, `border-stroke-subtle`, `brand-primary`, etc.) instead of introducing arbitrary colors.
- Reuse primitives from `src/components/ui/`: `Card`, `PillButton`, `Toggle`, `MetricDisplay`, `ChipSelector`, `KebabMenu`, and `DateTimePicker`.
- Reuse `src/lib/chart-theme.ts` for Recharts styling and `cn()` from `src/lib/utils.ts` for class composition.
- Preserve the matte card/pill visual language, 18 px cards, 12 px inner controls, responsive behavior, safe areas, and reduced mobile hover behavior.

## Implementation workflow

1. Establish the behavior and affected contracts before editing.
2. For backend changes, update schema/functions/helpers and add focused tests.
3. Run backend tests and type-check before changing dependent UI.
4. Update bridge hooks/types and frontend UI, then add component tests.
5. Run E2E tests for meaningful user-flow changes when the environment supports them.
6. Review `git diff --check`, `git diff`, and `git status --short` before handing off.
7. Update `MEMORY.md` whenever architecture, schema, jobs, environment requirements, invariants, known debt, or active work changes.

Do not create commits, push, deploy Convex, change Vercel configuration, send email, or operate a real device unless the user explicitly asks. If commits are requested, keep backend and frontend commits separate where practical and use conventional messages such as `feat(backend): ...` or `fix(frontend): ...`. The hook in `.github/hooks/pre-commit-lint.json` requires lint and type-check before commit.

## Verification matrix

Run the smallest relevant checks during iteration, then broaden in proportion to risk.

| Change | Required checks |
|---|---|
| Documentation only | Review rendered Markdown, `git diff --check` |
| Convex/backend | `npm run test:backend`, `npm run type-check`, `npm run lint` |
| React/UI | `npm run test:frontend`, `npm run type-check`, `npm run lint` |
| Cross-stack | `npm run test`, `npm run type-check`, `npm run lint` |
| Critical UI flow | Above plus `npm run test:e2e` if credentials/fixtures are available |
| Release-sensitive | Above plus `npm run build` |

The initial Vitest baseline covers EcoFlow protocol helpers, migration authorization, data formatting, and core UI controls. It is a starting point, not comprehensive coverage. Every bug fix should add a regression test, and new behavior should extend the relevant backend or frontend project.

ESLint currently enforces the recorded warning ceiling so new warnings fail the pre-push gate. Reduce the ceiling as warnings are repaired; the target is zero. The verification gate always runs `npm run lint` explicitly before the build.

Husky installs committed hooks through the `prepare` script. Pre-commit runs lint-staged; pre-push runs `npm run verify:push` (lint, types, tests, build). Do not bypass hooks with `--no-verify` except for a disclosed emergency.

## Environment and operational safety

Frontend/local configuration uses `NEXT_PUBLIC_CONVEX_URL` and `CONVEX_DEPLOYMENT`. Convex deployment variables include `CONVEX_SITE_URL`, `ECOFLOW_ACCESS_KEY`, `ECOFLOW_SECRET_KEY`, `RESEND_API_KEY`, optional `NEXT_PUBLIC_APP_URL`, optional `DISABLE_CRONS`, and temporary `MIGRATION_SECRET` for legacy imports.

- `.env.example` contains safe placeholders only. Keep it synchronized with runtime variable names and never insert real values.
- Never commit `.env*`, access keys, secret keys, deployment credentials, exported personal data, or real device serial numbers.
- `scripts/supabase-export.json` may contain migrated user/device data. Treat it as sensitive even though it is checked in; do not print or edit it casually.
- External actions can control physical power outputs, send email, or alter production data. Prefer static checks and mocks; require explicit authorization and a clearly identified environment for live operations.

## Definition of done

- The requested behavior is implemented without unrelated churn.
- Auth, ownership, validation, indexes, protocol semantics, and client/server boundaries remain correct.
- Relevant checks were run and their actual outcomes are reported; missing tests or environment blockers are stated plainly.
- No secrets, generated-file edits, debug logging, or accidental user changes were introduced.
- Documentation and `MEMORY.md` reflect any durable architectural change.
