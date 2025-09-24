# Zustand Store Migration Plan

## Overview
This document outlines the plan to convert all pages to use centralized Zustand state management while **preserving all existing UI designs and functionality**. The goal is to eliminate duplicate state management logic and ensure consistent data flow throughout the application.

## Current Status Analysis

### ✅ Pages Already Using Zustand Stores Correctly
- `src/app/(dashboard)/dashboard/page.tsx` - Uses `useDeviceStore`
- `src/app/(dashboard)/analytics/page.tsx` - Uses `useDeviceStore`
- `src/app/(dashboard)/history/page.tsx` - Uses `useDeviceStore` (partially)
- `src/app/(dashboard)/settings/page.tsx` - Uses `useAuthStore` and `useUIStore` (partially)

### ❌ Pages That Need Migration
1. **`src/app/(dashboard)/devices/page.tsx`** - Main devices listing page
2. **`src/app/(dashboard)/devices/add/page.tsx`** - Device registration page
3. **`src/app/(dashboard)/device/[deviceId]/page.tsx`** - Individual device page
4. **`src/app/(dashboard)/device/[deviceId]/settings/page.tsx`** - Device settings page
5. **`src/app/(dashboard)/history/page.tsx`** - Needs readings management (partial migration)
6. **`src/app/(dashboard)/settings/page.tsx`** - Needs user profile management (partial migration)

## Store Enhancements Needed

### 1. Device Store Extensions
The `deviceStore` needs these additional actions:
- `registerDevice(deviceSn: string, deviceName: string)` - For device registration
- `unregisterDevice(deviceId: string)` - For device removal
- `discoverDevices()` - For EcoFlow API device discovery
- `updateDeviceSettings(deviceId: string, settings: Partial<Device>)` - Device configuration updates

### 2. User Store Creation
Create a new `userStore` for user profile management:
- User profile data
- Notification preferences
- Data retention settings
- Password change functionality
- Backup/export functionality

### 3. Readings Store Creation
Create a new `readingsStore` for historical data:
- `readings: DeviceReading[]`
- `fetchReadings(deviceId: string, options)` - With filtering and pagination
- `exportReadings(deviceId: string, format: string)` - Data export

## Implementation Plan

### Phase 1: Store Enhancements (Priority: HIGH)

#### 1.1 Extend Device Store
**File**: `src/stores/deviceStore.ts`

Add the following actions without changing existing ones:
```typescript
interface DeviceActions {
  // ... existing actions ...
  
  // New actions for device management
  discoverDevices: () => Promise<EcoFlowDevice[]>
  registerDevice: (deviceSn: string, deviceName: string) => Promise<void>
  unregisterDevice: (deviceId: string) => Promise<void>
  updateDeviceSettings: (deviceId: string, settings: Partial<Device>) => Promise<void>
}
```

#### 1.2 Create User Store
**File**: `src/stores/userStore.ts`

```typescript
interface UserState {
  profile: UserProfile | null
  notifications: NotificationSettings | null
  isLoading: boolean
  error: string | null
}

interface UserActions {
  fetchProfile: () => Promise<void>
  updateProfile: (profile: Partial<UserProfile>) => Promise<void>
  updateNotificationSettings: (settings: NotificationSettings) => Promise<void>
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>
  exportData: (format: 'json' | 'csv') => Promise<void>
  testEmailSettings: () => Promise<void>
}
```

#### 1.3 Create Readings Store
**File**: `src/stores/readingsStore.ts`

```typescript
interface ReadingsState {
  readings: DeviceReading[]
  isLoading: boolean
  error: string | null
  totalCount: number
  hasMore: boolean
}

interface ReadingsActions {
  fetchReadings: (deviceId: string, options?: ReadingOptions) => Promise<void>
  exportReadings: (deviceId: string, format: string, options?: ReadingOptions) => Promise<void>
  clearReadings: () => void
}
```

### Phase 2: Page Migrations (Priority: HIGH)

#### 2.1 Main Devices Page Migration
**File**: `src/app/(dashboard)/devices/page.tsx`

**Changes**:
- Replace `useState<DeviceData[]>` with `useDeviceStore()`
- Replace `fetchDevices()` function with store action
- Keep all existing UI components and styling unchanged
- Maintain all filtering and search functionality

**Before**:
```tsx
const [devices, setDevices] = useState<DeviceData[]>([]);
const [loading, setLoading] = useState(true);
const fetchDevices = async () => { /* custom logic */ }
```

**After**:
```tsx
const { devices, isLoading, fetchDevices, error } = useDeviceStore();
```

#### 2.2 Device Registration Page Migration
**File**: `src/app/(dashboard)/devices/add/page.tsx`

**Changes**:
- Replace device discovery logic with `discoverDevices()` store action
- Replace registration logic with `registerDevice()` store action
- Keep all existing UI and form validation
- Maintain redirect behavior after registration

#### 2.3 Individual Device Page Migration
**File**: `src/app/(dashboard)/device/[deviceId]/page.tsx`

**Changes**:
- Use `getDeviceById(deviceId)` from store instead of API call
- Replace registration/unregistration with store actions
- Keep all existing device controls and UI

#### 2.4 Device Settings Page Migration
**File**: `src/app/(dashboard)/device/[deviceId]/settings/page.tsx`

**Changes**:
- Use `updateDeviceSettings()` store action
- Maintain all form validation and UI styling

#### 2.5 History Page Enhancement
**File**: `src/app/(dashboard)/history/page.tsx`

**Changes**:
- Add `useReadingsStore()` for readings management
- Keep existing `useDeviceStore()` for device selection
- Maintain all chart components and filtering UI

#### 2.6 Settings Page Enhancement
**File**: `src/app/(dashboard)/settings/page.tsx`

**Changes**:
- Add `useUserStore()` for profile management
- Keep existing `useAuthStore()` and `useUIStore()`
- Maintain all form sections and styling

### Phase 3: Testing and Validation (Priority: MEDIUM)

#### 3.1 Functionality Testing
- Verify all pages work identically to before migration
- Test all user interactions and form submissions
- Ensure data persistence across page navigation
- Validate error handling and loading states

#### 3.2 UI/UX Testing
- Confirm no visual changes to any page
- Test responsive design on all screen sizes
- Verify all animations and transitions work
- Check accessibility features remain intact

## Implementation Guidelines

### 🚨 Critical Requirements

1. **NO UI CHANGES**: All pages must look and behave exactly the same
2. **Progressive Migration**: Migrate one page at a time and test thoroughly
3. **Backward Compatibility**: Existing functionality must remain unchanged
4. **Error Handling**: Maintain all existing error messages and handling
5. **Loading States**: Keep all existing loading indicators and states

### 📋 Implementation Steps for Each Page

For each page migration, follow this checklist:

#### Step 1: Analyze Current Implementation
- [ ] Identify all `useState` hooks that should be moved to stores
- [ ] List all API calls that should use store actions
- [ ] Document all UI interactions and their current behavior

#### Step 2: Update Store (if needed)
- [ ] Add required actions to appropriate store
- [ ] Test new store actions independently
- [ ] Ensure proper error handling in store actions

#### Step 3: Migrate Component
- [ ] Replace local state with store state
- [ ] Replace API calls with store actions
- [ ] Keep all JSX and styling unchanged
- [ ] Maintain all event handlers and callbacks

#### Step 4: Testing
- [ ] Test all user interactions
- [ ] Verify data loads correctly
- [ ] Check error states display properly
- [ ] Confirm loading states work
- [ ] Test navigation between pages maintains state

#### Step 5: Validation
- [ ] Compare before/after screenshots
- [ ] Test on mobile and desktop
- [ ] Verify performance is same or better
- [ ] Check browser developer tools for errors

## Benefits After Migration

### 🚀 Performance Improvements
- Eliminate duplicate API calls across pages
- Shared state prevents unnecessary re-fetching
- Faster navigation between pages with cached data

### 🔧 Maintainability
- Single source of truth for all data
- Consistent error handling patterns
- Easier to add new features and pages

### 🐛 Bug Prevention
- No more state synchronization issues
- Consistent data across all components
- Centralized loading and error states

## Migration Priority Order

1. **Device Store Extensions** (Required for all device-related pages)
2. **Main Devices Page** (Most critical user-facing page)
3. **Device Registration Page** (Core functionality)
4. **User Store Creation** (For settings page)
5. **Settings Page Enhancement** (User profile management)
6. **Individual Device Page** (Device details and controls)
7. **Readings Store Creation** (For history page)
8. **History Page Enhancement** (Historical data management)
9. **Device Settings Page** (Device configuration)

## Success Metrics

- [ ] All pages use centralized stores
- [ ] No duplicate API logic exists
- [ ] UI/UX remains identical
- [ ] Performance is same or improved
- [ ] All functionality works as before
- [ ] No new bugs introduced

## Notes

- Each migration should be done in a separate commit for easy rollback if needed
- Test thoroughly after each page migration before moving to the next
- Keep existing interfaces and types to minimize refactoring
- Document any issues or edge cases discovered during migration