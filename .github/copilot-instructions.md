# GitHub Copilot Instructions for EcoFlow Dashboard

## Project Context

This is a full-stack Next.js dashboard for monitoring EcoFlow Delta 2 power stations. The application provides real-time device monitoring, historical data analytics, and device control capabilities with **fully functional authentication and EcoFlow API integration**.

## Current Project Status (COMPLETED ✅)

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

### ✅ **Production Issues Resolved**
- **Prepared Statement Conflicts**: Completely bypassed Prisma ORM with direct pg library to eliminate serverless prepared statement naming conflicts
- **SSL Certificate Configuration**: Properly configured SSL settings for Supabase production environment
- **Serverless Compatibility**: Optimized database connections for Vercel serverless functions
- **Error Handling**: Comprehensive error tracking and resolution for production stability

## Tech Stack & Architecture

### Core Technologies
- **Framework**: Next.js 15.5.3 with App Router and Turbopack
- **Styling**: Tailwind CSS + Chakra UI v2 (dark theme only)
- **State Management**: Zustand
- **Forms**: Formik + Yup validation
- **Animations**: GSAP
- **Icons**: Lucide React
- **Database**: Supabase (PostgreSQL) with direct pg library connection (Prisma ORM bypassed for production stability)
- **Authentication**: Supabase Auth (fully implemented)
- **API Integration**: EcoFlow API (fully working)
- **Deployment**: Vercel

### Current Project Structure
```
src/
├── app/                           # Next.js App Router pages
│   ├── login/                    # Modern authentication page ✅
│   ├── dashboard/                # Protected dashboard ✅
│   └── api/                      # API routes ✅
│       ├── auth/                 # Authentication endpoints ✅
│       ├── devices/              # Device management APIs ✅
│       └── test-*/               # Comprehensive testing suite ✅
├── components/                    # Reusable UI components
│   ├── ui/                       # Base UI components
│   ├── forms/                    # Form components
│   ├── charts/                   # Chart components
│   ├── layout/                   # Layout components with logout ✅
│   ├── AuthWrapper.tsx           # Route protection ✅
│   └── LogoutButton.tsx          # Auth controls ✅
├── lib/                          # Utility functions and configs
│   ├── ecoflow-api.ts           # Working EcoFlow API wrapper ✅
│   ├── database.ts              # Direct PostgreSQL connection ✅
│   ├── supabase.ts              # Supabase client ✅
│   ├── supabase-server.ts       # Server-side Supabase ✅
│   └── env-validation.ts        # Environment validation ✅
├── stores/                       # Zustand stores
├── types/                        # TypeScript type definitions
└── prisma/                       # Database schema ✅
    └── schema.prisma            # Complete database structure ✅
```

## Design System

### Color Palette (Dark Theme Only)
```typescript
const colors = {
  primary: {
    black: '#000000',
    dark: '#2b2b2b',
  },
  accent: {
    green: '#44af21',       // Primary brand color
    greenSecondary: '#00c356',
    greenLight: '#00e16e',
    blue: '#3a6fe3',
    gray: '#ebebeb',
  }
}
```

### Authentication UI Design
- **Modern Gradient Backgrounds**: Subtle green/blue gradients with blur effects
- **Glassmorphism**: Semi-transparent cards with backdrop blur
- **Interactive Elements**: Smooth transitions and hover states
- **Form Validation**: Real-time validation with clear error states
- **Responsive Design**: Mobile-first approach with proper breakpoints

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
    blue: '#3a6fe3',
    gray: '#ebebeb',
  }
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
// Always define proper interfaces for API responses
interface DeviceReading {
  id: string;
  deviceId: string;
  batteryLevel: number;
  inputWatts: number;
  outputWatts: number;
  temperature: number;
  status: DeviceStatus;
  recordedAt: Date;
}

// Use enums for constants
enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  CHARGING = 'charging',
  DISCHARGING = 'discharging',
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
import { Box, Text } from '@chakra-ui/react';

interface ComponentProps {
  // Props interface first
}

export const Component: FC<ComponentProps> = ({ prop1, prop2 }) => {
  // Hooks and state
  // Event handlers
  // Render logic
  
  return (
    <Box>
      {/* JSX content */}
    </Box>
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
# EcoFlow API (Working credentials configured)
ECOFLOW_ACCESS_KEY=2JDaLtMwMX2tE3WEEfddALhSJGbHjdeL
ECOFLOW_SECRET_KEY=GIgLC5YyTtGFfSrcFpUYKOdhJ9bsJoJ3pFKKw86JiUw

# Supabase (Fully configured)
NEXT_PUBLIC_SUPABASE_URL=https://hzjdlprkyofqtgllgfhm.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Database (Working connection)
DATABASE_URL=postgresql://postgres.hzjdlprkyofqtgllgfhm:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
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

### Chakra UI Usage
```typescript
// Use Chakra UI components with consistent props
<Box
  bg="primary.dark"
  p={4}
  borderRadius="md"
  border="1px solid"
  borderColor="accent.green"
>
  <Text color="accent.gray" fontSize="sm" fontWeight="medium">
    Battery Level
  </Text>
  <Text color="accent.green" fontSize="2xl" fontWeight="bold">
    {batteryLevel}%
  </Text>
</Box>
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
// Use Chakra UI responsive syntax
<Box
  display={{ base: 'block', md: 'flex' }}
  gridTemplateColumns={{ base: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }}
>
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
- **API Endpoints**: All critical endpoints (monitor-readings, devices, collect-readings) fully functional

### Development Commands
```bash
# Start development server
npm run dev

# Test EcoFlow API connection
curl http://localhost:3002/api/test-ecoflow

# Test authentication
# Visit: http://localhost:3002/login

# Access protected dashboard
# Visit: http://localhost:3002/dashboard (requires login)
```

### Key Files & Their Status
- ✅ `src/app/login/page.tsx` - Modern auth UI (COMPLETED)
- ✅ `src/lib/ecoflow-api.ts` - Working API wrapper (COMPLETED)
- ✅ `src/components/AuthWrapper.tsx` - Route protection (COMPLETED)
- ✅ `src/lib/supabase.ts` - Auth client (COMPLETED)
- ✅ `src/lib/database.ts` - Direct PostgreSQL connection (COMPLETED)
- ✅ `prisma/schema.prisma` - Database schema (COMPLETED)
- ✅ `.env.local` - All credentials configured (COMPLETED)

## Future Development Notes

The core infrastructure is complete. Future enhancements could include:
- Real-time device monitoring dashboards
- Device control interfaces
- Historical data charts and analytics
- Alert/notification systems
- User settings and preferences
- Device sharing and management

Remember: This is a dashboard for monitoring critical infrastructure, so prioritize reliability, accuracy, and user experience. Always validate data from external APIs and provide meaningful error messages to users.

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