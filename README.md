# EcoFlow Delta 2 Dashboard

A real-time dashboard for monitoring EcoFlow Delta 2 power stations. Built with Next.js 15, Convex, and the EcoFlow Developer API.

## Features

- **Real-time monitoring** — battery, power I/O, temperature, device status
- **Historical analytics** — charts, trends, energy consumption over time
- **Device management** — register/unregister devices, view settings
- **Automated collection** — server-side cron jobs poll EcoFlow API every minute
- **Email alerts** — low battery, high temperature, device offline notifications
- **Dark theme** — custom design system with Neue Montreal font

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.5 (App Router, Turbopack) |
| Backend | Convex (reactive DB, functions, crons, auth) |
| UI | React 19, Tailwind CSS v4 |
| State | Convex reactive queries + Zustand (UI only) |
| Charts | Recharts |
| Animations | GSAP + Framer Motion |
| Email | Resend |
| Auth | @convex-dev/auth (email/password) |

## Getting Started

### Prerequisites

- Node.js 18+
- Convex account ([convex.dev](https://convex.dev))
- EcoFlow Developer API credentials

### Setup

```bash
# Install dependencies
npm install

# Initialize Convex (first time)
npx convex dev

# Start development
npm run dev
```

### Environment Variables

Create `.env.local`:

```bash
CONVEX_DEPLOYMENT=dev:<your-deployment>
NEXT_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
```

Set in Convex Dashboard → Settings → Environment Variables:

```
ECOFLOW_ACCESS_KEY=<your-key>
ECOFLOW_SECRET_KEY=<your-secret>
RESEND_API_KEY=<your-resend-key>
```

## Architecture

```
Browser (React)
  ↕ Convex reactive queries (WebSocket)
Convex Cloud
  ├── Auth (email/password)
  ├── Database (12 application tables + Convex auth tables)
  ├── Cron Jobs (collect readings, monitor, cleanup)
  └── Actions → EcoFlow REST API (HMAC-SHA256)
```

### Cron Jobs

| Job | Interval | Purpose |
|---|---|---|
| `collect-readings` | 1 min | Poll EcoFlow API, store readings |
| `device-monitor` | 15 min | Check thresholds, send alerts |
| `data-cleanup` | 24 hours | Delete readings past retention period |
| `backup-check` | 1 hour | Send scheduled JSON backups by email |
| `process-schedules` | 1 min | Execute timezone-aware device schedules |

## Scripts

```bash
npm run dev          # Development server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript validation
npm run test         # Backend and frontend tests
npm run verify       # Full pre-push quality gate
npx convex dev       # Convex dev mode (watch + deploy)
npx convex deploy    # Deploy Convex to production
```

## Engineering workflow

Run `npm install` once to install dependencies and activate the committed Husky
hooks. The hooks enforce the same repository scripts on every contributor's
machine:

- Pre-commit runs ESLint against staged source files.
- Pre-push runs lint, type-checking, all Vitest projects, and a production build.
- `npm run verify:full` adds Playwright E2E tests when the required local
  environment and credentials are available.

Hooks can be bypassed with Git's `--no-verify` escape hatch, but doing so should
be exceptional and disclosed in the pull request. See `AGENTS.md` for the full
engineering contract and `MEMORY.md` for the current architecture snapshot.

## Project Structure

```
convex/              # Backend functions, schema, crons
src/
├── app/             # Next.js pages (App Router)
│   ├── login/       # Auth page
│   └── (dashboard)/ # SPA route group
├── components/      # React components
├── hooks/           # useConvexData bridge hooks
├── lib/             # Utilities (types, formatting, API wrapper)
└── stores/          # Zustand (UI state only)
```
