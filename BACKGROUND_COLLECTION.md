# Background Reading Collection

## Architecture

Reading collection is handled entirely server-side by **Convex cron jobs**. No client-side timers, workers, or service workers are needed.

### Cron Jobs (`convex/crons.ts`)

| Job | Interval | Function | Purpose |
|---|---|---|---|
| `collect-readings` | 1 minute | `ecoflow.collectAllUserReadings` | Polls EcoFlow API for each user's devices, inserts readings |
| `device-monitor` | 15 minutes | `ecoflow.monitorDevices` | Checks device health, sends email alerts if thresholds breached |
| `data-cleanup` | 24 hours | `admin.cleanupOldReadings` | Deletes readings older than user's retention period |

### Data Flow

```
Convex Cron (every 1 min)
  → ecoflow.collectAllUserReadings (action)
    → For each user with devices:
      → EcoFlow API: GET /iot-open/sign/device/quota/all
      → Transform quota data → deviceReadings table INSERT
    → Convex reactivity pushes new data to connected clients instantly
```

### Configuration

- **Collection interval**: Fixed at 1 minute via cron. Per-user `collectionIntervalMinutes` in `dataRetentionSettings` can be used to skip collections if the last one was too recent.
- **Retention period**: Configurable per user in Settings → Data Retention. Default: 90 days.
- **Alerts**: Configured in Settings → Notifications. Email sent via Resend when thresholds are breached.

### Monitoring

- **Convex Dashboard → Cron Jobs**: View execution history, success/failure status
- **Convex Dashboard → Logs**: Real-time function execution logs
- **Dashboard UI**: `ReadingCollector` component shows cron status and last collection time
