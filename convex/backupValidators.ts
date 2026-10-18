import { v } from "convex/values";
import { dcInputSourceValidator } from "./readingQuality";

export const backupCursor = v.union(v.string(), v.null());
export const backupDestination = v.union(v.literal("email"), v.literal("googleDrive"));
export const backupRunValidator = v.object({
  token: v.string(), startTime: v.float64(), endTime: v.float64(), part: v.float64(),
  deviceCursor: backupCursor, deviceId: v.optional(v.id("devices")),
  nextDeviceCursor: v.optional(backupCursor), readingCursor: backupCursor,
  leaseUntil: v.float64(), retryCount: v.float64(), preparedStorageId: v.optional(v.id("_storage")),
  destination: v.optional(backupDestination), driveConnectionVersion: v.optional(v.string()),
  driveFolderId: v.optional(v.string()), drivePartFileId: v.optional(v.string()),
  driveManifestFileId: v.optional(v.string()), driveManifestStorageId: v.optional(v.id("_storage")),
  driveReadingCount: v.optional(v.float64()), driveTotalBytes: v.optional(v.float64()),
});
export const backupDeviceValidator = v.object({
  deviceName: v.string(), deviceSn: v.string(), deviceType: v.string(), isActive: v.boolean(),
  dcInputSource: dcInputSourceValidator, registeredAt: v.string(),
});
export const backupSettingsValidator = v.object({
  dataRetention: v.object({ retentionPeriodDays: v.float64(), autoCleanupEnabled: v.boolean(),
    backupEnabled: v.boolean(), backupDestination, backupIntervalHours: v.float64(), collectionIntervalMinutes: v.float64() }),
  notifications: v.object({ deviceAlerts: v.boolean(), lowBattery: v.boolean(), powerThreshold: v.boolean(),
    systemUpdates: v.boolean(), weeklyReports: v.boolean(), emailNotifications: v.boolean(),
    pushNotifications: v.boolean(), lowBatteryThreshold: v.float64(), powerThresholdWatts: v.float64() }),
});
export const backupContextValidator = v.union(v.null(), v.object({
  run: backupRunValidator,
  user: v.object({ email: v.string(), firstName: v.union(v.string(), v.null()), lastName: v.union(v.string(), v.null()) }),
  settings: backupSettingsValidator,
}));
export const backupPaginationFields = {
  isDone: v.boolean(), continueCursor: backupCursor,
  splitCursor: v.optional(backupCursor),
  pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
};
