# EcoFlow Dashboard - Data Collection System

## Hybrid Collection Strategy for Vercel Free Plan

Due to Vercel Free Plan limitations (cron jobs limited to daily execution), we've implemented a hybrid approach to ensure reliable data collection:

### 1. Daily Backup Cron Job (Vercel)
- **Schedule**: Daily at midnight UTC (`0 0 * * *`)
- **Purpose**: Ensures data is collected even when no users are active
- **Endpoint**: `/api/cron/collect-readings`
- **Authentication**: Uses `CRON_SECRET` environment variable

### 2. Client-Side Active Collection
- **Frequency**: Every 5 minutes when users are active
- **Triggers**: Automatically starts when dashboard loads
- **Behavior**: Pauses when browser tab is hidden (saves API quota)
- **Controls**: Users can start/stop collection manually

## Implementation Details

### Environment Variables Required
```bash
# Cron job authentication
CRON_SECRET=your-secure-random-string
```

### Key Files
- `src/hooks/useClientSideReadingCollection.ts` - Client-side collection hook
- `src/app/api/cron/collect-readings/route.ts` - Daily Vercel cron endpoint
- `src/app/api/devices/collect-readings/route.ts` - Manual collection endpoint
- `src/components/CronStatusWidget.tsx` - Status monitoring widget
- `vercel.json` - Cron job configuration

### Collection Status Monitoring
The dashboard shows:
- **Database Stats**: Total readings, active devices, last reading time
- **Daily Backup**: Vercel cron job status and schedule
- **Active Collection**: Client-side collection status with manual controls

## Benefits
1. **Reliable Backup**: Daily cron ensures data isn't lost
2. **Real-time Updates**: Active users get frequent data updates
3. **API Efficiency**: Tab visibility detection saves quota
4. **Free Plan Compatible**: Works within Vercel's limitations
5. **User Control**: Manual start/stop for active collection

## Usage
1. Users see automatic collection start when they load the dashboard
2. Collection continues every 5 minutes while tab is active
3. Collection pauses when tab is hidden/inactive
4. Daily backup runs regardless of user activity
5. All readings are stored in the database for analytics

This hybrid approach provides the best of both worlds: reliable data backup and real-time updates for active users, all within the constraints of the Vercel Free Plan.