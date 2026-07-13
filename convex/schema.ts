import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

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
  }).index("by_email", ["email"]),

  // ─── Devices ────────────────────────────────────────────────────────────────
  devices: defineTable({
    userId: v.id("users"),
    deviceSn: v.string(),
    deviceName: v.optional(v.string()),
    deviceType: v.string(), // e.g. "DELTA_2"
    isActive: v.boolean(),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  })
    .index("by_userId", ["userId"])
    .index("by_deviceSn", ["deviceSn"]),

  // ─── Device Readings ───────────────────────────────────────────────────────
  deviceReadings: defineTable({
    deviceId: v.id("devices"),
    batteryLevel: v.optional(v.float64()),
    inputWatts: v.optional(v.float64()),
    acInputWatts: v.optional(v.float64()),
    dcInputWatts: v.optional(v.float64()),
    chargingType: v.optional(v.float64()),
    outputWatts: v.optional(v.float64()),
    acOutputWatts: v.optional(v.float64()),
    dcOutputWatts: v.optional(v.float64()),
    usbOutputWatts: v.optional(v.float64()),
    remainingTime: v.optional(v.float64()),
    temperature: v.optional(v.float64()),
    status: v.optional(v.string()),
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
    .index("by_deviceId_recordedAt", ["deviceId", "recordedAt"]),

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
    backupIntervalHours: v.optional(v.float64()), // 24, 168 (weekly), 720 (monthly)
    lastBackupAt: v.optional(v.float64()), // epoch ms of last backup email
    collectionIntervalMinutes: v.float64(),
    lastCleanup: v.optional(v.float64()),
    lastCollectionAt: v.optional(v.float64()), // track last cron collection per user
  }).index("by_userId", ["userId"]),

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
    .index("by_userId_sentAt", ["userId", "sentAt"]),

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
