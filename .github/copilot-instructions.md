# GitHub Copilot Instructions for EcoFlow Dashboard

## Project Context

Full-stack Next.js dashboard for monitoring EcoFlow Delta 2 power stations. Real-time device monitoring, historical analytics, device control, and automated data collection via **Convex** backend (reactive database, server-side cron jobs, built-in auth).

## Tech Stack

- **Framework**: Next.js 15.5.x with App Router + Turbopack
- **Backend**: Convex (reactive database, functions, cron jobs, auth)
- **UI**: React 19, Tailwind CSS v4 (dark theme only)
- **State**: Convex reactive queries (primary), Zustand (UI-only: sidebar, notifications)
- **Forms**: Formik + Yup
- **Animations**: GSAP + Framer Motion
- **Charts**: Recharts
- **Icons**: Lucide React
- **Notifications**: Sonner (toasts)
- **Email**: Resend (via Convex action)
- **Deployment**: Vercel (frontend) + Convex Cloud (backend)

## Architecture

### Convex Backend (`convex/`)

All data fetching, mutations, and background jobs run on Convex. No Next.js API routes.

| File | Purpose |
|---|---|
| `schema.ts` | 11 tables + authTables (users, devices, deviceReadings, deviceSettings, dailySummaries, alerts, dataRetentionSettings, notificationSettings, notificationLogs, sessionSettings, passwordChangeLog) |
| `auth.ts` / `auth.config.ts` | `@convex-dev/auth` with Password provider |
| `http.ts` | HTTP router for auth endpoints |
| `users.ts` | Profile queries/mutations |
| `devices.ts` | Device CRUD (auth-gated queries + mutations) |
| `devices_internal.ts` | Internal queries for cron use |
| `readings.ts` | Reading queries + history with date range filtering + `computeSummary` |
| `ecoflow.ts` | EcoFlow API actions (discover devices, collect readings for all users) |
| `settings.ts` | Data retention, notification, session settings |
| `email.ts` | Resend email sending (internal actions) |
| `email_log.ts` | Email log queries |
| `admin.ts` | Data cleanup mutation |
| `crons.ts` | 4 scheduled jobs: collect-readings (1min), device-monitor (15min), data-cleanup (24h), backup-check (1h) |
| `migrations.ts` | One-time Supabase→Convex data migration |

### Frontend (`src/`)

```
src/
├── app/
│   ├── layout.tsx              # ConvexClientProvider + ConvexAuthProvider
│   ├── page.tsx                # Root redirect
│   ├── login/page.tsx          # Auth UI (sign in / sign up)
│   └── (dashboard)/            # SPA route group with persistent layout
│       ├── layout.tsx          # DashboardLayout (Header + Sidebar + AuthWrapper)
│       ├── dashboard/          # Main dashboard
│       ├── devices/            # Device list + /add page
│       ├── device/[deviceId]/  # Device detail + /settings
│       ├── history/            # Historical data charts
│       ├── analytics/          # Analytics dashboard
│       └── settings/           # User settings
├── components/
│   ├── AuthWrapper.tsx         # Convex auth gate (redirects to /login if unauthenticated)
│   ├── LogoutButton.tsx        # signOut via @convex-dev/auth
│   ├── ReadingCollector.tsx    # Displays Convex cron status
│   ├── charts/HistoryCharts.tsx
│   ├── controls/               # DeviceStatusCard, DeviceControlPanel
│   ├── layout/                 # Header, Sidebar, AppLayout
│   └── ui/                     # Card, PillButton, Toggle, etc.
├── hooks/
│   ├── useConvexData.ts        # 8 bridge hooks wrapping Convex queries/mutations
│   └── useBreakpoint.ts        # Responsive breakpoint hook
├── lib/
│   ├── chart-theme.ts          # Recharts theming
│   ├── data-utils.ts           # DeviceData/DeviceReading types + formatting
│   ├── ecoflow-api.ts          # EcoFlow API wrapper (HMAC-SHA256 auth)
│   └── utils.ts                # cn() class merge utility
├── stores/
│   ├── index.ts                # Barrel export (uiStore only)
│   └── uiStore.ts              # Sidebar state, notifications (Zustand)
└── types/index.ts              # Application-wide TypeScript types
```

### Data Flow

```
Convex Cron (every 1 min)
  → ecoflow.collectAllUserReadings
    → EcoFlow REST API (HMAC-SHA256 signed)
    → INSERT into deviceReadings table
    → Convex reactivity → useQuery() in React → UI updates instantly
```

## Bridge Hooks (`src/hooks/useConvexData.ts`)

All pages use these hooks instead of direct Convex imports:

- `useConvexDevices()` — device list + latest reading per device
- `useConvexReadings(deviceId)` — latest 50 readings for a device
- `useConvexReadingHistory(deviceId, startTime, endTime)` — date-range readings
- `useConvexHistoryReadings(deviceId, range)` — readings for a time range string
- `useConvexDeviceMutations()` — register/unregister device
- `useConvexDiscover()` — discover devices from EcoFlow API
- `useConvexSettings()` — all 3 settings domains (retention, notifications, sessions)
- `useConvexProfile()` — user profile + update

## Design System

All tokens in `@theme` block in `src/app/globals.css` (Tailwind v4). **No `tailwind.config.ts`.**

```css
--color-bg-base: #151615;
--color-surface-1: #1f201f;
--color-surface-2: #242624;
--color-brand-primary: #44af21;
--color-brand-secondary: #00c356;
--color-brand-tertiary: #3a6fe3;
--radius-card: 18px;
--radius-pill: 999px;
```

Font: Neue Montreal (`public/fonts/`). Dark theme only.

## Coding Conventions

- **Components**: PascalCase, FC with explicit props interface
- **Hooks**: `use` prefix, camelCase
- **Convex functions**: `query`, `mutation`, `action`, `internalQuery`, `internalMutation`, `internalAction`
- **Auth guard**: All Convex queries/mutations check `auth.getUserId(ctx)` first
- **Null handling**: Convex returns `null` (not `undefined`) — use `?? undefined` when needed
- **Timestamps**: Convex stores as epoch ms (`float64`), convert with `new Date(timestamp)`

## EcoFlow API

```typescript
const baseURL = 'https://api-e.ecoflow.com'  // Must use api-e, not api
// HMAC-SHA256 signature: sort params alphabetically, sign with secret key
// See src/lib/ecoflow-api.ts for full implementation
```

### Charging State & Remaining Time

The Delta 2 can simultaneously have input (e.g. solar) **and** output (e.g. loads). Charging state must use **net power flow**, not raw `inputWatts > 0`.

**Key raw API fields:**
- `pd.remainTime` — signed: positive = charging, negative = discharging (authoritative firmware signal)
- `bms_emsStatus.chgRemainTime` — minutes until full (only valid when actually net-charging)
- `bms_emsStatus.dsgRemainTime` — minutes until empty (only valid when actually net-discharging)

**Logic in `convex/ecoflow.ts` → `transformQuotaToReading()`:**
```typescript
const netPower = totalInput - totalOutput;
const hasPdRemainSign = pdRemain !== null && pdRemain !== 0;
const isNetCharging = hasPdRemainSign ? pdRemain > 0 : netPower > 10;   // firmware sign > fallback
const isNetDischarging = hasPdRemainSign ? pdRemain < 0 : netPower < -10;
// Pick chgRemainTime (positive) when charging, -dsgRemainTime (negative) when discharging
```

**`remainingTime` sign convention** (stored in DB, used by `formatRemainingTime()`):
- **positive** → charging → "X until full"
- **negative** → discharging → "X remaining"

**Frontend `DeviceStatusCard.getStatusInfo()`** mirrors the same net-power logic to show Charging / Discharging / Pass-through / Standby status.

## Development

```bash
# Application should already be running — do NOT start another dev server
npm run lint              # ESLint
npm run type-check        # TypeScript
npm run build             # Production build

# Convex
npx convex dev            # Deploy functions to dev + watch mode
npx convex deploy         # Deploy to production
```

## Environment Variables

```bash
# Convex (auto-configured)
CONVEX_DEPLOYMENT=dev:acrobatic-swordfish-996
NEXT_PUBLIC_CONVEX_URL=https://acrobatic-swordfish-996.convex.cloud

# EcoFlow API
ECOFLOW_ACCESS_KEY=...
ECOFLOW_SECRET_KEY=...

# Email (Resend)
RESEND_API_KEY=...

# Set in Convex Dashboard (not .env.local):
# ECOFLOW_ACCESS_KEY, ECOFLOW_SECRET_KEY, RESEND_API_KEY
```
