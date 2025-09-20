# GitHub Copilot Instructions for EcoFlow Dashboard

## Project Context

This is a full-stack Next.js dashboard for monitoring EcoFlow Delta 2 power stations. The application provides real-time device monitoring, historical data analytics, and device control capabilities.

## Tech Stack & Architecture

### Core Technologies
- **Framework**: Next.js 14 with App Router
- **Styling**: Tailwind CSS + Chakra UI v2 (dark theme only)
- **State Management**: Zustand
- **Forms**: Formik + Yup validation
- **Animations**: GSAP
- **Icons**: Lucide React
- **Database**: Supabase (PostgreSQL) with Prisma ORM
- **Authentication**: NextAuth.js or Supabase Auth
- **Deployment**: Vercel

### Project Structure
```
src/
├── app/                    # Next.js App Router pages
├── components/             # Reusable UI components
│   ├── ui/                # Base UI components
│   ├── forms/             # Form components
│   ├── charts/            # Chart components
│   └── layout/            # Layout components
├── lib/                   # Utility functions and configs
│   ├── ecoflow-api.ts     # EcoFlow API wrapper
│   ├── supabase.ts        # Supabase client
│   └── utils.ts           # General utilities
├── stores/                # Zustand stores
├── types/                 # TypeScript type definitions
└── styles/                # Global styles
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
    green: '#44af21',
    greenSecondary: '#00c356',
    greenLight: '#00e16e',
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

### EcoFlow API Patterns
```typescript
// API wrapper class methods should be async and handle errors
class EcoFlowAPI {
  async getDeviceStatus(deviceSN: string): Promise<DeviceStatus> {
    try {
      const response = await this.makeRequest('/device/status', { deviceSN });
      return this.transformDeviceStatus(response.data);
    } catch (error) {
      throw new APIError('Failed to fetch device status', error);
    }
  }
}

// API routes should follow RESTful patterns
// GET /api/devices - List all devices
// GET /api/devices/[id] - Get specific device
// POST /api/devices/[id]/control - Control device
// GET /api/devices/[id]/readings - Get device readings
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

### Prisma Schema Conventions
```prisma
// Use descriptive model names
model DeviceReading {
  id         String   @id @default(uuid())
  deviceId   String
  device     Device   @relation(fields: [deviceId], references: [id])
  batteryLevel Int
  inputWatts   Decimal  @db.Decimal(10, 2)
  recordedAt   DateTime @default(now())
  
  @@index([deviceId, recordedAt(sort: Desc)])
}
```

### Database Query Patterns
```typescript
// Use Prisma client with proper error handling
const getDeviceReadings = async (deviceId: string, limit = 100) => {
  try {
    return await prisma.deviceReading.findMany({
      where: { deviceId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
      include: { device: true },
    });
  } catch (error) {
    throw new DatabaseError('Failed to fetch device readings', error);
  }
};
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

## Performance Optimization

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