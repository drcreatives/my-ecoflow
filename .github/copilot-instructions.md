# GitHub Copilot Instructions for EcoFlow Dashboard

## Project Context

This is a full-stack Next.js dashboard for monitoring EcoFlow Delta 2 power stations. The application provides real-time device monitoring, historical data analytics, and device control capabilities with **fully functional authentication and EcoFlow API integration**.

## Current Project Status - SPA ARCHITECTURE COMPLETED ✅

### ✅ **Single Page Application (SPA) Architecture**
- **Full SPA Conversion**: Successfully converted all 8 dashboard pages to SPA architecture using Next.js route groups
- **Route Group Pattern**: All dashboard pages organized under `(dashboard)` route group with persistent layout
- **Performance Optimization**: Implemented global state persistence in AuthWrapper to prevent re-initialization on navigation
- **Fast Navigation**: Navigation between pages is now instant without unnecessary auth checks or API calls
- **Persistent Layout**: Single layout wrapper (`DashboardLayout`) shared across all dashboard pages
- **Memory Efficiency**: Global state caching prevents redundant device fetching and reading collection restarts

### ✅ **Authentication System**
- **Supabase Authentication**: Fully implemented with email/password signup and login
- **Modern Auth UI**: Beautiful, responsive login/signup page with form validation
- **Protected Routes**: AuthWrapper component protecting dashboard and sensitive pages
- **Session Management**: Automatic session handling and logout functionality

### ✅ **EcoFlow API Integration**
- **Working API Connection**: Successfully connecting to EcoFlow API with real device data
- **Correct Authentication**: Fixed signature format to match official EcoFlow documentation
- **Real Device Data**: Fetching actual device information (DELTA 2: R331ZKB5SG7V0293)
- **API Endpoints**: All device endpoints functional with proper error handling

### ✅ **Database & Infrastructure**
- **Supabase Database**: PostgreSQL database with direct connection (bypassing Prisma ORM)
- **Complete Schema**: User, Device, DeviceReading, DeviceAlert tables
- **Production-Ready**: Resolved Prisma prepared statement conflicts with direct pg library
- **SSL Configuration**: Proper SSL handling for Supabase in production environment
- **Client/Server Separation**: Proper Next.js App Router configuration
- **Environment Setup**: All credentials configured and validated

### ✅ **Testing Infrastructure**
- **Comprehensive Test Suite**: Multiple API testing endpoints
- **Debug Tools**: Detailed logging and error tracking
- **Validation**: Database, authentication, and API connection testing

### ✅ **Device Management System**
- **Complete Devices Page**: Full-featured device listing with search, filtering, and status monitoring
- **Device Registration**: Add device page with EcoFlow API discovery and manual entry
- **Responsive Design**: Mobile-first approach with floating action buttons and adaptive layouts
- **Real-time Status**: Live device status monitoring with battery, power, and temperature metrics
- **Custom UI Components**: Dark-themed custom dropdowns and interactive elements

### ✅ **Production Issues Resolved**
- **Prepared Statement Conflicts**: Completely bypassed Prisma ORM with direct pg library to eliminate serverless prepared statement naming conflicts
- **SSL Certificate Configuration**: Properly configured SSL settings for Supabase production environment
- **Serverless Compatibility**: Optimized database connections for Vercel serverless functions
- **Error Handling**: Comprehensive error tracking and resolution for production stability

## Tech Stack & Architecture

### Core Technologies
- **Framework**: Next.js 15.5.3 with App Router and Turbopack
- **UI**: React 19
- **Styling**: Tailwind CSS v4 (dark theme only)
- **State Management**: Zustand
- **Forms**: Formik + Yup validation
- **Animations**: GSAP + Framer Motion (simple transitions)
- **Charts**: Recharts
- **Icons**: Lucide React
- **Notifications**: Sonner
- **Email**: Resend + React Email
- **Database**: Supabase (PostgreSQL) with direct pg library connection (Prisma ORM bypassed for production stability)
- **Authentication**: Supabase Auth (fully implemented)
- **API Integration**: EcoFlow API (fully working)
- **Deployment**: Vercel

### Current Project Structure
```
middleware.ts                      # Supabase auth session refresh + route protection ✅
src/
├── app/                           # Next.js App Router pages
│   ├── (dashboard)/              # SPA Route Group with persistent layout ✅
│   │   ├── layout.tsx            # Persistent DashboardLayout wrapper ✅
│   │   ├── dashboard/            # Main dashboard page ✅
│   │   ├── devices/              # Device management pages ✅
│   │   ├── device/[deviceId]/    # Individual device pages ✅
│   │   ├── history/              # Historical data page ✅
│   │   ├── analytics/            # Analytics dashboard ✅
│   │   └── settings/             # Settings page ✅
│   ├── login/                    # Modern authentication page ✅
│   ├── page.tsx                  # Landing/redirect page ✅
│   └── api/                      # API routes ✅
│       ├── auth/                 # Authentication endpoints ✅
│       ├── devices/              # Device management APIs ✅
│       │   ├── route.ts         # Device CRUD operations ✅
│       │   ├── collect-readings/ # Reading collection (interval-aware) ✅
│       │   ├── latest-readings/  # Fetch latest readings per device ✅
│       │   ├── monitor/          # Live device monitoring ✅
│       │   └── [deviceId]/       # Single-device operations ✅
│       ├── cron/                 # Cron-triggered background jobs ✅
│       │   └── collect-readings/ # Scheduled reading collection ✅
│       ├── history/              # Historical data queries ✅
│       ├── readings/             # Reading management ✅
│       ├── register-device/      # Device registration ✅
│       ├── unregister-device/    # Device removal ✅
│       ├── monitor-readings/     # Reading monitor endpoint ✅
│       ├── email/                # Email sending ✅
│       ├── user/                 # User management ✅
│       ├── logout/               # Logout endpoint ✅
│       └── test-*/               # Comprehensive testing suite ✅
├── components/                    # Reusable UI components
│   ├── charts/                   # Chart components (HistoryCharts) ✅
│   ├── controls/                 # Device control panel & status card ✅
│   ├── layout/                   # AppLayout, Header, Sidebar ✅
│   ├── AuthWrapper.tsx           # Route protection with state persistence ✅
│   ├── LogoutButton.tsx          # Auth controls ✅
│   ├── ReadingCollector.tsx      # Client-side reading collector ✅
│   ├── CronStatusWidget.tsx      # Cron job status display ✅
│   └── DatabaseSetupButton.tsx   # DB setup utility ✅
├── hooks/                         # Custom React hooks
│   ├── useAutomaticReadingCollection.ts  # Auto reading collection ✅
│   ├── useClientSideReadingCollection.ts # Client-side collection ✅
│   └── useBreakpoint.ts                  # Responsive breakpoints ✅
├── lib/                          # Utility functions and configs
│   ├── ecoflow-api.ts           # Working EcoFlow API wrapper ✅
│   ├── database.ts              # Direct PostgreSQL connection ✅
│   ├── supabase.ts              # Supabase client ✅
│   ├── supabase-server.ts       # Server-side Supabase ✅
│   ├── data-utils.ts            # Data formatting utilities ✅
│   ├── email.ts                 # Email service (Resend + React Email) ✅
│   ├── email-simple.ts          # Lightweight email helper ✅
│   ├── utils.ts                 # General utilities ✅
│   ├── prisma.ts                # Prisma client (legacy, prefer database.ts) ⚠️
│   └── env-validation.ts        # Environment validation ✅
├── stores/                       # Zustand stores
│   ├── index.ts                 # Store exports ✅
│   ├── authStore.ts             # Authentication state ✅
│   ├── deviceStore.ts           # Device list & selection ✅
│   ├── readingsStore.ts         # Device readings cache ✅
│   ├── uiStore.ts               # UI state (sidebar, notifications) ✅
│   └── userStore.ts             # User profile state ✅
├── types/                        # TypeScript type definitions
│   └── index.ts                 # All application types & enums ✅
└── prisma/                       # Database schema ✅
    └── schema.prisma            # Complete database structure ✅
```

## Design System

### Design System — Dark Modular Energy Dashboard
```typescript
// Tailwind tokens defined in tailwind.config.ts
const colors = {
  'bg-base': '#151615',         // Page background
  'surface-1': '#1f201f',       // Card surfaces
  'surface-2': '#242624',       // Input backgrounds, nested elements
  'stroke-subtle': 'rgba(255,255,255,0.08)',
  'stroke-strong': 'rgba(255,255,255,0.15)',
  'text-primary': 'rgba(255,255,255,0.92)',
  'text-secondary': 'rgba(255,255,255,0.65)',
  'text-muted': 'rgba(255,255,255,0.45)',
  'icon': 'rgba(255,255,255,0.55)',
  'brand-primary': '#44af21',   // Main accent (buttons, indicators)
  'brand-secondary': '#00c356',
  'brand-tertiary': '#3a6fe3',  // Blue accent (links, info)
  'success': '#00e16e',
  'warning': '#ffa500',
  'danger': '#ff4444',
}
// borderRadius: card 18px, pill 999px, inner 12px
// boxShadow: card, card-hover
// Font: Neue Montreal (loaded from public/fonts/)
// Motion: 160ms hover, 220ms chart/panel, ease-dashboard cubic-bezier(0.2,0.8,0.2,1)
```

### UI Components (src/components/ui/)
- **Card**: `bg-surface-1 border-stroke-subtle rounded-card shadow-card` — variants: default, accent, hero
- **PillButton**: `rounded-pill` — variants: primary (filled), filled, ghost, danger
- **Toggle**: `w-12 h-6` — on: `bg-brand-primary`, off: `bg-stroke-strong`
- **MetricDisplay**: `text-metric` (44px) with unit label and optional trend
- **ChipSelector**: Pill chips with active state highlight
- **KebabMenu**: Three-dot dropdown menu

### Authentication UI Design
- **Solid matte background**: `bg-bg-base` (no gradients, no glassmorphism)
- **Card container**: `bg-surface-1 border border-stroke-subtle rounded-card shadow-card`
- **Interactive Elements**: 160ms transitions with dashboard easing
- **Form Validation**: Real-time validation with `text-danger` error states
- **Responsive Design**: Mobile-first approach with proper breakpoints

### Middleware (Auth Session Refresh)
The root `middleware.ts` uses `@supabase/ssr` to refresh Supabase sessions on every request and enforce route protection:
- Unauthenticated users hitting `/dashboard*` are redirected to `/login`
- Authenticated users hitting `/login` are redirected to `/dashboard`
- Runs on all paths except static assets

## Current Working Features

### 🔐 **Authentication System**
```typescript
// Login/Signup flow with Supabase
const { data, error } = await supabase.auth.signInWithPassword({
  email: formData.email,
  password: formData.password
})

// Protected route wrapper
<AuthWrapper>
  <Dashboard />
</AuthWrapper>
```

### 📡 **EcoFlow API Integration**
```typescript
// Working API connection with correct signature
const api = new EcoFlowAPI({
  accessKey: process.env.ECOFLOW_ACCESS_KEY,
  secretKey: process.env.ECOFLOW_SECRET_KEY
})

// Real device data fetch
const devices = await api.getDeviceList()
// Returns: [{ sn: 'R331ZKB5SG7V0293', deviceName: "Daniel Runor's DELTA 2", online: 1 }]
```

### 🗄️ **Database Schema & Direct Connection**
```typescript
// Direct PostgreSQL connection (bypasses Prisma prepared statement conflicts)
import { executeQuery } from '@/lib/database'

// Example query using direct connection
const devices = await executeQuery<Device[]>(
  'SELECT * FROM devices WHERE user_id = $1',
  [userId]
)
```
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  createdAt DateTime @default(now())
  devices   Device[]
}

model Device {
  id           String          @id @default(uuid())
  deviceSn     String          @unique
  deviceName   String
  userId       String
  user         User            @relation(fields: [userId], references: [id])
  readings     DeviceReading[]
  alerts       DeviceAlert[]
}
```

### Component Naming Conventions
- **UI Components**: PascalCase (e.g., `StatusCard`, `PowerGauge`)
- **Pages**: PascalCase (e.g., `DashboardPage`, `DeviceDetailPage`)
- **Hooks**: camelCase with `use` prefix (e.g., `useDeviceData`, `useRealTimeUpdates`)
- **Utils**: camelCase (e.g., `formatPowerValue`, `calculateEfficiency`)
- **Types**: PascalCase with descriptive names (e.g., `DeviceReading`, `EcoFlowAPIResponse`)

## Coding Guidelines

### TypeScript Best Practices
```typescript
// Always define proper interfaces for API responses (see src/types/index.ts)
interface DeviceReading {
  id: string;
  deviceId: string;
  batteryLevel?: number;
  inputWatts?: number;
  outputWatts?: number;       // Total output (AC + DC) from pd.wattsOutSum
  remainingTime?: number;     // Minutes: positive = until full, negative = until empty
  temperature?: number;
  status?: string;
  rawData?: Record<string, unknown>;
  recordedAt: Date;
}

// Use enums for constants (defined in src/types/index.ts)
enum AlertType {
  BATTERY_LOW = 'BATTERY_LOW',
  TEMPERATURE_HIGH = 'TEMPERATURE_HIGH',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  POWER_OVERLOAD = 'POWER_OVERLOAD',
  CHARGING_ERROR = 'CHARGING_ERROR',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

enum AlertSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// Use generic types for reusable components
interface DataCardProps<T> {
  data: T;
  title: string;
  formatter?: (value: T) => string;
}
```

### Component Structure
```typescript
// Preferred component structure
import { FC } from 'react';

interface ComponentProps {
  // Props interface first
}

export const Component: FC<ComponentProps> = ({ prop1, prop2 }) => {
  // Hooks and state
  // Event handlers
  // Render logic
  
  return (
    <div className="bg-surface-1 border border-stroke-subtle rounded-card p-6">
      {/* JSX content */}
    </div>
  );
};
```

### State Management Patterns
```typescript
// Zustand store structure
interface DeviceStore {
  // State
  devices: Device[];
  currentDevice: Device | null;
  isLoading: boolean;
  error: string | null;
  
  // Actions (grouped logically)
  fetchDevices: () => Promise<void>;
  selectDevice: (deviceId: string) => void;
  updateDeviceStatus: (deviceId: string, status: Partial<Device>) => void;
  
  // Computed values
  getDeviceById: (id: string) => Device | undefined;
}
```

## API Integration

### EcoFlow API Configuration
```typescript
// Correct API configuration (CRITICAL)
const baseURL = 'https://api-e.ecoflow.com'  // Must use api-e, not api
const endpoint = '/iot-open/sign/device/list'

// Signature generation (matches official docs)
const params = {
  accessKey: credentials.accessKey,
  nonce: Math.floor(100000 + Math.random() * 900000).toString(), // 6-digit number
  timestamp: Date.now()
}

const sortedParams = Object.keys(params)
  .sort()
  .map(key => `${key}=${params[key]}`)
  .join('&')

const signature = crypto
  .createHmac('sha256', credentials.secretKey)
  .update(sortedParams)
  .digest('hex')
```

### API Testing Endpoints
- `/api/test-ecoflow` - Main API functionality test
- `/api/test-official-format` - Signature format verification
- `/api/devices` - Protected device management
- `/api/auth` - Authentication endpoints

## Security & Environment

### Required Environment Variables
```bash
# EcoFlow API
ECOFLOW_ACCESS_KEY=your_access_key
ECOFLOW_SECRET_KEY=your_secret_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Database
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<db>
```

### Error Handling
```typescript
// Consistent error handling across the app
interface APIError {
  message: string;
  code?: string;
  statusCode?: number;
}

// Use error boundaries for React error handling
// Use try-catch for async operations
// Show user-friendly error messages
```

## Database Patterns

### Direct PostgreSQL Connection (Production-Ready)
```typescript
// IMPORTANT: Use direct pg library instead of Prisma for production
import { executeQuery } from '@/lib/database'

// Direct query execution (no prepared statement conflicts)
const getDeviceReadings = async (deviceId: string, limit = 100) => {
  try {
    return await executeQuery<DeviceReading[]>(
      `SELECT 
        device_id as "deviceId",
        battery_level as "batteryLevel", 
        input_watts as "inputWatts",
        output_watts as "outputWatts",
        recorded_at as "recordedAt"
      FROM device_readings 
      WHERE device_id = $1 
      ORDER BY recorded_at DESC 
      LIMIT $2`,
      [deviceId, limit]
    );
  } catch (error) {
    throw new DatabaseError('Failed to fetch device readings', error);
  }
};
```

### SSL Configuration for Production
```typescript
// Database connection with SSL for Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false // Required for Supabase
  } : false
})
```

### Critical Production Notes
```typescript
// IMPORTANT: Prisma ORM causes prepared statement conflicts in serverless
// Use direct PostgreSQL queries instead:

// ❌ AVOID: Prisma in production serverless
const data = await prisma.device.findMany()

// ✅ USE: Direct PostgreSQL connection
const data = await executeQuery<Device[]>(
  'SELECT * FROM devices WHERE user_id = $1',
  [userId]
)
```

## UI/UX Guidelines

### Tailwind CSS & Design Tokens
```typescript
// Use Tailwind CSS with design system tokens
<div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6">
  <h3 className="text-text-primary font-semibold mb-2">Device Status</h3>
  <p className="text-text-secondary text-sm">Battery Level</p>
  <p className="text-brand-primary text-metric font-bold">{batteryLevel}%</p>
</div>

// Pill buttons for actions
<button className="bg-brand-primary text-bg-base rounded-pill px-6 py-2 font-semibold
  hover:brightness-110 transition-all duration-160 ease-dashboard">
  Start Monitoring
</button>
```

### Animation Guidelines
```typescript
// Use GSAP for complex animations
// Use Framer Motion for simple transitions
// Keep animations subtle and purposeful
// Respect user's motion preferences

const animateCard = (element: HTMLElement) => {
  gsap.fromTo(element, 
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }
  );
};
```

### Responsive Design
```typescript
// Use Tailwind CSS responsive classes
<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
  <div className="bg-surface-1 border border-stroke-subtle rounded-card shadow-card p-6">
    {/* Device card content */}
  </div>
</div>

// Mobile-first approach with floating action buttons
<Link
  href="/devices/add"
  className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-brand-primary rounded-full shadow-card flex items-center justify-center"
>
  <Plus size={24} />
</Link>
```

## Development Workflow

### Current Status Summary
🎉 **The EcoFlow Dashboard is now FULLY FUNCTIONAL!**

#### ✅ Completed Features:
1. **Modern Authentication System**
   - Beautiful login/signup page with real-time validation
   - Supabase authentication integration
   - Protected routes with AuthWrapper
   - Logout functionality in dashboard header

2. **Working EcoFlow API Integration**
   - Correct API endpoint: `https://api-e.ecoflow.com`
   - Proper signature generation matching official docs
   - Successfully fetching real device data
   - Device: DELTA 2 (SN: R331ZKB5SG7V0293)

3. **Complete Database Infrastructure**
   - Supabase PostgreSQL database
   - Direct pg library connection (bypassing Prisma ORM for production stability)
   - User, Device, DeviceReading, DeviceAlert tables
   - SSL configuration for production environment
   - Client/server separation for Next.js App Router

4. **Comprehensive Testing Suite**
   - Multiple API test endpoints
   - Authentication flow testing
   - Database connection validation
   - Environment variable verification

#### 🚀 **Production Stability Achieved**:
- **Prepared Statement Conflicts**: Completely resolved by bypassing Prisma ORM
- **SSL Certificate Issues**: Fixed with proper Supabase SSL configuration
- **Serverless Compatibility**: Optimized for Vercel deployment environment
- **API Endpoints**: All critical endpoints (monitor-readings, devices, collect-readings) functional
- **Database Permissions**: Collect-readings endpoint fully functional with interval-aware collection

#### 🎨 **UI/UX Implementation**:
- **Complete Devices Management**: Full-featured /devices page with search, filtering, and device cards
- **Device Registration Flow**: /devices/add page with EcoFlow API discovery and manual entry
- **Dark Theme Consistency**: Custom dropdown components and consistent styling
- **Mobile-First Design**: Responsive layouts with floating action buttons
- **Multiple Navigation Paths**: Header buttons, grid cards, floating FAB, and empty state CTAs

### Development Commands & Testing Guidelines

**IMPORTANT**: The developer is already running the application on port 3000. **NEVER run `npm run dev`** or start additional development servers.

```bash
# Code Quality & Testing (Use these for validation)
npm run lint              # ESLint validation
npm run type-check        # TypeScript type checking
npm run build            # Production build test

# API Testing (Application already running on port 3000)
curl http://localhost:3000/api/test-ecoflow           # Test EcoFlow API connection
curl http://localhost:3000/api/test-official-format   # Signature format verification
curl http://localhost:3000/api/devices               # Protected device management

# Manual Testing URLs (Application running on port 3000)
# Visit: http://localhost:3000/login                  # Authentication flow
# Visit: http://localhost:3000/dashboard              # Main dashboard (requires login)
# Visit: http://localhost:3000/devices                # Device management (requires login)
# Visit: http://localhost:3000/devices/add            # Add new devices (requires login)
# Visit: http://localhost:3000/history                # Historical data (requires login)
# Visit: http://localhost:3000/analytics              # Analytics dashboard (requires login)
# Visit: http://localhost:3000/settings               # Settings page (requires login)

# Database Testing
# Visit: http://localhost:3000/api/test-db-connection  # Database connection validation
# Visit: http://localhost:3000/api/test-migration      # Schema validation
```

**Testing Protocol**:
1. **Always use lint and type-check commands** instead of starting dev server
2. **Application is already running** - test endpoints directly at localhost:3000
3. **For builds**, use `npm run build` to validate production readiness
4. **Never interrupt** the existing development server

### Key Files & Their Status
- ✅ `src/app/(dashboard)/layout.tsx` - Persistent SPA layout wrapper (COMPLETED)
- ✅ `src/app/login/page.tsx` - Modern auth UI (COMPLETED)
- ✅ `src/app/(dashboard)/dashboard/page.tsx` - Main dashboard page (COMPLETED)
- ✅ `src/app/(dashboard)/devices/page.tsx` - Full devices management page (COMPLETED)
- ✅ `src/app/(dashboard)/devices/add/page.tsx` - Device registration page (COMPLETED)
- ✅ `src/app/(dashboard)/history/page.tsx` - Historical data page (COMPLETED)
- ✅ `src/app/(dashboard)/analytics/page.tsx` - Analytics dashboard (COMPLETED)
- ✅ `src/app/(dashboard)/settings/page.tsx` - Settings page (COMPLETED)
- ✅ `src/lib/ecoflow-api.ts` - Working API wrapper (COMPLETED)
- ✅ `src/components/AuthWrapper.tsx` - Route protection with state persistence (COMPLETED)
- ✅ `src/lib/supabase.ts` - Auth client (COMPLETED)
- ✅ `src/lib/database.ts` - Direct PostgreSQL connection (COMPLETED)
- ✅ `prisma/schema.prisma` - Database schema (COMPLETED)
- ✅ `.env.local` - All credentials configured (COMPLETED)
- ✅ `src/app/api/devices/collect-readings/route.ts` - Interval-aware reading collection

## Future Development Notes

### Current Status Summary
🎉 **The EcoFlow Dashboard is now FULLY FUNCTIONAL with Complete SPA Architecture!**

#### ✅ **SPA Infrastructure** (COMPLETED):
1. **Single Page Application Architecture** - Full SPA conversion using Next.js route groups
2. **Performance Optimization** - Global state persistence preventing unnecessary re-initialization
3. **Fast Navigation** - Instant page transitions without auth checks or API calls
4. **Persistent Layout** - Single DashboardLayout wrapper shared across all dashboard pages

#### ✅ **Core Infrastructure** (COMPLETED):
5. **Modern Authentication System** - Supabase auth with beautiful UI
6. **Working EcoFlow API Integration** - Real device data (DELTA 2: R331ZKB5SG7V0293)
7. **Production Database** - Direct PostgreSQL connection with SSL
8. **Comprehensive Testing Suite** - Full API validation

#### ✅ **Device Management** (COMPLETED):
9. **Devices Listing Page** - `/devices` with search, filtering, and device cards
10. **Device Registration** - `/devices/add` with API discovery and manual entry
11. **Custom UI Components** - Dark-themed dropdowns and responsive design
12. **Multiple Navigation Paths** - Header buttons, grid cards, floating FAB

#### ⚠️ **Minor Issues / Risks**:
- Collection jobs may require service role permissions in production depending on DB policies

The core infrastructure is complete. Future enhancements could include:
- Real-time device monitoring dashboards
- Device control interfaces
- Historical data charts and analytics
- Alert/notification systems
- User settings and preferences
- Device sharing and management

Remember: This is a dashboard for monitoring critical infrastructure, so prioritize reliability, accuracy, and user experience. Always validate data from external APIs and provide meaningful error messages to users.

### Reading Collection System
The dashboard includes two reading collection strategies:
- **Server-side / Cron**: `POST /api/devices/collect-readings` and `/api/cron/collect-readings` — interval-aware background collection that respects each user's `collection_interval_minutes` setting. Can target a single user (`?userId=`) or run globally. Skips users whose last collection is within their interval unless `?force=true`.
- **Client-side hooks**: `useAutomaticReadingCollection` and `useClientSideReadingCollection` trigger collection via the API while the user has the dashboard open, with configurable polling intervals.
- **Data flow**: EcoFlow API → `ecoflowAPI.getDeviceQuota()` → `transformQuotaToReading()` → INSERT into `device_readings` table (stores AC, DC, USB output breakdowns, battery level, temperature, remaining time, and raw JSON).

### Data Fetching
```typescript
// Use SWR or React Query for data fetching
// Implement proper caching strategies
// Use pagination for large datasets
// Implement optimistic updates where appropriate

const { data, error, isLoading } = useSWR(
  `/api/devices/${deviceId}/readings`,
  fetcher,
  { refreshInterval: 30000 } // 30 seconds
);
```

### Code Splitting
```typescript
// Use dynamic imports for heavy components
const ChartComponent = dynamic(() => import('./Chart'), {
  loading: () => <ChartSkeleton />,
  ssr: false
});
```

## Security Best Practices

### Environment Variables
```bash
# Always use environment variables for sensitive data
ECOFLOW_ACCESS_KEY=your_access_key
ECOFLOW_SECRET_KEY=your_secret_key
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Input Validation
```typescript
// Use Yup schemas for form validation
const deviceSchema = yup.object({
  deviceName: yup.string().required().min(3).max(50),
  deviceSN: yup.string().required().matches(/^[A-Z0-9]+$/),
});

// Validate API inputs server-side
```

## Testing Guidelines

### Component Testing
```typescript
// Test component behavior, not implementation
// Use React Testing Library
// Test user interactions and accessibility

test('should display battery level correctly', () => {
  render(<BatteryCard level={75} />);
  expect(screen.getByText('75%')).toBeInTheDocument();
});
```

### API Testing
```typescript
// Test API routes with proper mocking
// Test error conditions
// Test authentication and authorization
```

## Deployment Notes

### Vercel Configuration
- Use environment variables for all sensitive data
- Configure build optimization settings
- Set up proper redirects and rewrites
- Enable Edge Functions for better performance

### Database Migration
- Always test migrations in staging first
- Use Prisma migration files
- Plan rollback strategies
- Monitor performance after deployments

## Development Workflow

1. **Feature Development**: Create feature branch from `main`
2. **Code Quality**: Use ESLint, Prettier, and TypeScript strict mode
3. **Testing**: Write tests for new features and bug fixes
4. **Review**: Create pull request with proper description
5. **Deployment**: Merge to `main` triggers automatic deployment

## Common Patterns

### Real-time Data Updates
```typescript
// Use WebSocket or polling for real-time updates
useEffect(() => {
  const interval = setInterval(() => {
    fetchLatestData();
  }, 30000); // 30 seconds

  return () => clearInterval(interval);
}, []);
```

### Form Handling
```typescript
// Use Formik with Yup validation
const formik = useFormik({
  initialValues: { deviceName: '' },
  validationSchema: deviceSchema,
  onSubmit: async (values) => {
    await updateDevice(values);
  },
});
```

### Error Boundaries
```typescript
// Implement error boundaries for graceful error handling
class DeviceErrorBoundary extends React.Component {
  // Error boundary implementation
}
```

Remember: This is a dashboard for monitoring critical infrastructure, so prioritize reliability, accuracy, and user experience. Always validate data from external APIs and provide meaningful error messages to users.