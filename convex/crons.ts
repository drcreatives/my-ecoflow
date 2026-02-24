import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// ─── Collect device readings every minute ─────────────────────────────────────
// The action itself checks each user's collectionIntervalMinutes before
// actually hitting the EcoFlow API, so this runs as a lightweight tick.
crons.interval(
  "collect-readings",
  { minutes: 1 },
  internal.ecoflow.collectAllUserReadings
);

// ─── Check device alerts every 15 minutes ─────────────────────────────────────
crons.interval(
  "device-monitor",
  { minutes: 15 },
  internal.devices.checkDeviceAlerts
);

// ─── Data cleanup once every 24 hours ─────────────────────────────────────────
crons.interval(
  "data-cleanup",
  { hours: 24 },
  internal.admin.cleanupOldReadings
);

// ─── Automatic backup check every hour ────────────────────────────────────────
// Checks each user's backup settings and sends email backups when the
// configured interval has elapsed (default: every 24 hours).
crons.interval(
  "backup-check",
  { hours: 1 },
  internal.backup.checkAndRunBackups
);

export default crons;
