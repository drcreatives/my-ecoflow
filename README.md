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
  ├── Database (11 tables)
  ├── Cron Jobs (collect readings, monitor, cleanup)
  └── Actions → EcoFlow REST API (HMAC-SHA256)
```

### Cron Jobs

| Job | Interval | Purpose |
|---|---|---|
| `collect-readings` | 1 min | Poll EcoFlow API, store readings |
| `device-monitor` | 15 min | Check thresholds, send alerts |
| `data-cleanup` | 24 hours | Delete readings past retention period |

## Scripts

```bash
npm run dev          # Development server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript validation
npx convex dev       # Convex dev mode (watch + deploy)
npx convex deploy    # Deploy Convex to production
```

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
