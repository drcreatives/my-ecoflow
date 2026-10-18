import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { chargingTypeSourceValidator, dcInputSourceValidator, inputMeasurementValidator, inputQualityValidator } from "./readingQuality";
import { displayTelemetryValidator } from "./displayTelemetry";

export default defineSchema({
  ...authTables,

  // ─── Users ──────────────────────────────────────────────────────────────────
  users: defineTable({
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.float64()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    image: v.optional(v.string()),
    name: v.optional(v.string()),
    isAnonymous: v.optional(v.boolean()),
    createdAt: v.optional(v.float64()),
    updatedAt: v.optional(v.float64()),
    // Private export consistency marker; advanced atomically with retention deletions.
    readingDeletionRevision: v.optional(v.float64()),
  }).index("by_email", ["email"]),

  // ─── Devices ────────────────────────────────────────────────────────────────
  devices: defineTable({
    userId: v.id("users"),
    deviceSn: v.string(),
    deviceName: v.optional(v.string()),
    deviceType: v.string(), // e.g. "DELTA_2"
    isActive: v.boolean(),
    dcInputSource: v.optional(dcInputSourceValidator),
    displayTelemetry: v.optional(displayTelemetryValidator),
    // Internal singleflight state for stable MQTT client IDs; never returned
    // by public device queries.
    mqttLeases: v.optional(v.object({
      collector: v.optional(v.object({ token: v.string(), expiresAt: v.float64() })),
      diagnostic: v.optional(v.object({ token: v.string(), expiresAt: v.float64() })),
      temperature: v.optional(v.object({ token: v.string(), expiresAt: v.float64() })),
    })),
    lastRefreshAttemptAt: v.optional(v.float64()),
    lastRefreshSucceededAt: v.optional(v.float64()),
    lastStatusCheckAt: v.optional(v.float64()),
    connectionStatus: v.optional(v.union(v.literal("online"), v.literal("offline"), v.literal("error"))),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  })
    .index("by_userId", ["userId"])
    .index("by_isActive", ["isActive"])
    .index("by_deviceSn", ["deviceSn"]),

  // ─── Device Readings ───────────────────────────────────────────────────────
  deviceReadings: defineTable({
    deviceId: v.id("devices"),
    // Independent BMS observations must not replace or participate in PD power readings.
    readingKind: v.optional(v.literal("temperature")),
    temperatureMeasurement: v.optional(v.literal("bms-generic-mqtt-v1")),
    batteryLevel: v.optional(v.float64()),
    inputWatts: v.optional(v.float64()),
    acInputWatts: v.optional(v.float64()),
    dcInputWatts: v.optional(v.float64()),
    solarInputWatts: v.optional(v.float64()),
    chargingType: v.optional(v.float64()),
    chargingTypeSource: v.optional(chargingTypeSourceValidator),
    inputQuality: v.optional(inputQualityValidator),
    inputMeasurement: v.optional(inputMeasurementValidator),
    powerMeasurement: v.optional(v.literal("pd-totals-mqtt-v1")),
    // PV-panel input is a separate measurement point from station input.
    solarPanelInputWatts: v.optional(v.float64()),
    solarPanelReceivedAt: v.optional(v.float64()),
    solarPanelMeasurement: v.optional(v.literal("delta2-mppt-mqtt-v1")),
    outputWatts: v.optional(v.float64()),
    acOutputWatts: v.optional(v.float64()),
    dcOutputWatts: v.optional(v.float64()),
    usbOutputWatts: v.optional(v.float64()),
    remainingTime: v.optional(v.float64()),
    temperature: v.optional(v.float64()),
    status: v.optional(v.string()),
    // Legacy imports/readings may contain the full EcoFlow quota payload.
    // New inserts omit it because history queries only use extracted fields.
    rawData: v.optional(v.any()),
    recordedAt: v.float64(), // epoch ms
    // ─── Config state (extracted from quota) ─────────────────────────────────
    acEnabled: v.optional(v.boolean()),
    dcOutEnabled: v.optional(v.boolean()),
    carChargerEnabled: v.optional(v.boolean()),
    acXboost: v.optional(v.boolean()),
    acOutVoltage: v.optional(v.float64()),
    acOutFrequency: v.optional(v.float64()),
    acChargingWatts: v.optional(v.float64()),
    acChargingPaused: v.optional(v.boolean()),
    dcChargingCurrent: v.optional(v.float64()),
    acStandbyMins: v.optional(v.float64()),
    carStandbyMins: v.optional(v.float64()),
    unitStandbyMins: v.optional(v.float64()),
    maxChargeSoc: v.optional(v.float64()),
    minDischargeSoc: v.optional(v.float64()),
    solarPriority: v.optional(v.boolean()),
    energyMgmtEnabled: v.optional(v.boolean()),
    backupReserveSoc: v.optional(v.float64()),
    acAutoOutEnabled: v.optional(v.boolean()),
    minAcOutSoc: v.optional(v.float64()),
    smartGenOnSoc: v.optional(v.float64()),
    smartGenOffSoc: v.optional(v.float64()),
    lcdOffSeconds: v.optional(v.float64()),
    buzzerSilent: v.optional(v.boolean()),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_deviceId_recordedAt", ["deviceId", "recordedAt"])
    .index("by_deviceId_readingKind_recordedAt", ["deviceId", "readingKind", "recordedAt"]),

  // ─── Device Settings ───────────────────────────────────────────────────────
  deviceSettings: defineTable({
    deviceId: v.id("devices"),
    settingKey: v.string(),
    settingValue: v.optional(v.string()),
    updatedAt: v.float64(),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_deviceId_settingKey", ["deviceId", "settingKey"]),

  // ─── Daily Summaries ───────────────────────────────────────────────────────
  dailySummaries: defineTable({
    deviceId: v.id("devices"),
    date: v.string(), // "YYYY-MM-DD"
    avgBatteryLevel: v.optional(v.float64()),
    totalEnergyIn: v.optional(v.float64()),
    totalEnergyOut: v.optional(v.float64()),
    maxTemperature: v.optional(v.float64()),
    minTemperature: v.optional(v.float64()),
    totalRuntime: v.optional(v.float64()),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_deviceId_date", ["deviceId", "date"]),

  // ─── Alerts ─────────────────────────────────────────────────────────────────
  alerts: defineTable({
    deviceId: v.id("devices"),
    type: v.string(), // AlertType enum value
    title: v.string(),
    message: v.string(),
    severity: v.string(), // AlertSeverity enum value
    isRead: v.boolean(),
    createdAt: v.float64(),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_deviceId_createdAt", ["deviceId", "createdAt"]),

  // ─── Data Retention Settings ───────────────────────────────────────────────
  dataRetentionSettings: defineTable({
    userId: v.id("users"),
    retentionPeriodDays: v.float64(),
    autoCleanupEnabled: v.boolean(),
    backupEnabled: v.boolean(),
    backupDestination: v.optional(v.union(v.literal("email"), v.literal("googleDrive"))),
    lastDriveBackupAt: v.optional(v.float64()),
    backupIntervalHours: v.optional(v.float64()), // 24, 168 (weekly), 720 (monthly)
    lastBackupAt: v.optional(v.float64()), // epoch ms of last backup email
    // Trusted stored-at watermark, written only after a complete new archive.
    // The legacy seven-day email timestamp above does not authorize deletion.
    lastCompleteBackupAt: v.optional(v.float64()),
    // Private resumable email archive state. Omitted from settings responses.
    backupRun: v.optional(v.object({
      token: v.string(),
      startTime: v.float64(),
      endTime: v.float64(),
      part: v.float64(),
      deviceCursor: v.union(v.string(), v.null()),
      deviceId: v.optional(v.id("devices")),
      nextDeviceCursor: v.optional(v.union(v.string(), v.null())),
      readingCursor: v.union(v.string(), v.null()),
      leaseUntil: v.float64(),
      retryCount: v.float64(),
      preparedStorageId: v.optional(v.id("_storage")),
      destination: v.optional(v.union(v.literal("email"), v.literal("googleDrive"))),
      driveConnectionVersion: v.optional(v.string()),
      driveFolderId: v.optional(v.string()),
      drivePartFileId: v.optional(v.string()),
      driveManifestFileId: v.optional(v.string()),
      driveManifestStorageId: v.optional(v.id("_storage")),
      driveReadingCount: v.optional(v.float64()),
      driveTotalBytes: v.optional(v.float64()),
    })),
    collectionIntervalMinutes: v.float64(),
    lastCleanup: v.optional(v.float64()),
    lastCollectionAt: v.optional(v.float64()), // track last cron collection per user
  }).index("by_userId", ["userId"]),

  // Private offline Drive grants and short-lived, one-use OAuth attempts.
  googleDriveConnections: defineTable({
    userId: v.id("users"),
    version: v.string(),
    updatedAt: v.float64(),
    encryptedRefreshToken: v.optional(v.string()),
    folderId: v.optional(v.string()),
    connectedAt: v.optional(v.float64()),
    reconnectRequired: v.optional(v.boolean()),
    oauthStateHash: v.optional(v.string()),
    oauthBrowserNonceHash: v.optional(v.string()),
    oauthEncryptedCodeVerifier: v.optional(v.string()),
    oauthExpiresAt: v.optional(v.float64()),
    oauthReturnOrigin: v.optional(v.string()),
    oauthStatus: v.optional(v.union(v.literal("waiting"), v.literal("exchanging"), v.literal("ready"))),
    oauthClaimToken: v.optional(v.string()),
    oauthEncryptedRefreshToken: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_oauthStateHash", ["oauthStateHash"]),

  // ─── Notification Settings ─────────────────────────────────────────────────
  notificationSettings: defineTable({
    userId: v.id("users"),
    deviceAlerts: v.boolean(),
    lowBattery: v.boolean(),
    powerThreshold: v.boolean(),
    systemUpdates: v.boolean(),
    weeklyReports: v.boolean(),
    emailNotifications: v.boolean(),
    pushNotifications: v.boolean(),
    lowBatteryThreshold: v.float64(),
    powerThresholdWatts: v.float64(),
  }).index("by_userId", ["userId"]),

  // ─── Notification Logs ────────────────────────────────────────────────────
  notificationLogs: defineTable({
    userId: v.id("users"),
    type: v.string(),
    email: v.optional(v.string()),
    deviceId: v.optional(v.id("devices")),
    subject: v.optional(v.string()),
    messageId: v.optional(v.string()),
    status: v.string(), // "sent" | "failed"
    errorMessage: v.optional(v.string()),
    sentAt: v.float64(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_sentAt", ["userId", "sentAt"])
    .index("by_userId_type_sentAt", ["userId", "type", "sentAt"]),

  // ─── Session Settings ─────────────────────────────────────────────────────
  sessionSettings: defineTable({
    userId: v.id("users"),
    sessionTimeoutMinutes: v.float64(),
    autoLogoutEnabled: v.boolean(),
    rememberMeDurationDays: v.float64(),
    forceLogoutOnNewDevice: v.boolean(),
  }).index("by_userId", ["userId"]),

  // ─── Password Change Log ──────────────────────────────────────────────────
  passwordChangeLog: defineTable({
    userId: v.id("users"),
    changedAt: v.float64(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  // ─── Device Schedules ─────────────────────────────────────────────────────
  deviceSchedules: defineTable({
    deviceId: v.id("devices"),
    userId: v.id("users"),
    name: v.string(),
    enabled: v.boolean(),
    time: v.string(), // "HH:MM" in 24h format
    daysOfWeek: v.array(v.float64()), // 0=Sun..6=Sat; empty = every day
    action: v.object({
      moduleType: v.float64(),
      operateType: v.string(),
      params: v.any(),
    }),
    timezone: v.string(), // e.g. "America/New_York"
    lastExecutedAt: v.optional(v.float64()),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  })
    .index("by_deviceId", ["deviceId"])
    .index("by_userId", ["userId"]),
});
