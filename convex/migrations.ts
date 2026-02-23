import { internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ─── Types for imported data ─────────────────────────────────────────────────

const supabaseDeviceValidator = v.object({
  id: v.string(), // old UUID
  device_sn: v.string(),
  device_name: v.optional(v.string()),
  device_type: v.optional(v.string()),
  is_active: v.optional(v.boolean()),
  created_at: v.optional(v.string()), // ISO date string
  updated_at: v.optional(v.string()),
});

const supabaseReadingValidator = v.object({
  id: v.string(),
  device_id: v.string(), // old UUID, will be remapped
  battery_level: v.optional(v.union(v.float64(), v.null())),
  input_watts: v.optional(v.union(v.float64(), v.null())),
  ac_input_watts: v.optional(v.union(v.float64(), v.null())),
  dc_input_watts: v.optional(v.union(v.float64(), v.null())),
  charging_type: v.optional(v.union(v.float64(), v.null())),
  output_watts: v.optional(v.union(v.float64(), v.null())),
  ac_output_watts: v.optional(v.union(v.float64(), v.null())),
  dc_output_watts: v.optional(v.union(v.float64(), v.null())),
  usb_output_watts: v.optional(v.union(v.float64(), v.null())),
  remaining_time: v.optional(v.union(v.float64(), v.null())),
  temperature: v.optional(v.union(v.float64(), v.null())),
  status: v.optional(v.union(v.string(), v.null())),
  raw_data: v.optional(v.any()),
  recorded_at: v.string(), // ISO date string
});

const supabaseSettingValidator = v.object({
  id: v.string(),
  device_id: v.string(),
  setting_key: v.string(),
  setting_value: v.optional(v.union(v.string(), v.null())),
  updated_at: v.optional(v.string()),
});

const supabaseDailySummaryValidator = v.object({
  id: v.string(),
  device_id: v.string(),
  date: v.string(), // "YYYY-MM-DD" or ISO
  avg_battery_level: v.optional(v.union(v.float64(), v.null())),
  total_energy_in: v.optional(v.union(v.float64(), v.null())),
  total_energy_out: v.optional(v.union(v.float64(), v.null())),
  max_temperature: v.optional(v.union(v.float64(), v.null())),
  min_temperature: v.optional(v.union(v.float64(), v.null())),
  total_runtime: v.optional(v.union(v.float64(), v.null())),
});

const supabaseAlertValidator = v.object({
  id: v.string(),
  device_id: v.string(),
  type: v.string(),
  title: v.string(),
  message: v.string(),
  severity: v.string(),
  is_read: v.optional(v.boolean()),
  created_at: v.optional(v.string()),
});

// ─── Internal mutations (called by the orchestrating action) ─────────────────

/**
 * Import devices for a given Convex user.
 * Returns a mapping of old Supabase UUID → new Convex _id.
 */
export const importDevices = internalMutation({
  args: {
    userId: v.id("users"),
    devices: v.array(supabaseDeviceValidator),
  },
  handler: async (ctx, args) => {
    const idMap: Record<string, string> = {};

    for (const device of args.devices) {
      // Check if device already exists (idempotent)
      const existing = await ctx.db
        .query("devices")
        .withIndex("by_deviceSn", (q) => q.eq("deviceSn", device.device_sn))
        .first();

      if (existing) {
        idMap[device.id] = existing._id;
        continue;
      }

      const newId = await ctx.db.insert("devices", {
        userId: args.userId,
        deviceSn: device.device_sn,
        deviceName: device.device_name ?? "EcoFlow Device",
        deviceType: device.device_type ?? "DELTA_2",
        isActive: device.is_active ?? true,
        createdAt: device.created_at
          ? new Date(device.created_at).getTime()
          : Date.now(),
        updatedAt: device.updated_at
          ? new Date(device.updated_at).getTime()
          : Date.now(),
      });

      idMap[device.id] = newId;
    }

    return idMap;
  },
});

/**
 * Import a batch of device readings.
 * Accepts the old-UUID → new Convex ID map for device remapping.
 */
export const importReadingsBatch = internalMutation({
  args: {
    deviceIdMap: v.record(v.string(), v.string()),
    readings: v.array(supabaseReadingValidator),
  },
  handler: async (ctx, args) => {
    let imported = 0;
    let skipped = 0;

    for (const reading of args.readings) {
      const newDeviceId = args.deviceIdMap[reading.device_id];
      if (!newDeviceId) {
        skipped++;
        continue;
      }

      await ctx.db.insert("deviceReadings", {
        deviceId: newDeviceId as any, // Convex _id
        batteryLevel: reading.battery_level ?? undefined,
        inputWatts: reading.input_watts ?? undefined,
        acInputWatts: reading.ac_input_watts ?? undefined,
        dcInputWatts: reading.dc_input_watts ?? undefined,
        chargingType: reading.charging_type ?? undefined,
        outputWatts: reading.output_watts ?? undefined,
        acOutputWatts: reading.ac_output_watts ?? undefined,
        dcOutputWatts: reading.dc_output_watts ?? undefined,
        usbOutputWatts: reading.usb_output_watts ?? undefined,
        remainingTime: reading.remaining_time ?? undefined,
        temperature: reading.temperature ?? undefined,
        status: reading.status ?? undefined,
        rawData: reading.raw_data ?? undefined,
        recordedAt: new Date(reading.recorded_at).getTime(),
      });
      imported++;
    }

    return { imported, skipped };
  },
});

/**
 * Import device settings.
 */
export const importSettings = internalMutation({
  args: {
    deviceIdMap: v.record(v.string(), v.string()),
    settings: v.array(supabaseSettingValidator),
  },
  handler: async (ctx, args) => {
    let imported = 0;

    for (const setting of args.settings) {
      const newDeviceId = args.deviceIdMap[setting.device_id];
      if (!newDeviceId) continue;

      // Check for existing (idempotent)
      const existing = await ctx.db
        .query("deviceSettings")
        .withIndex("by_deviceId_settingKey", (q) =>
          q.eq("deviceId", newDeviceId as any).eq("settingKey", setting.setting_key)
        )
        .first();

      if (existing) continue;

      await ctx.db.insert("deviceSettings", {
        deviceId: newDeviceId as any,
        settingKey: setting.setting_key,
        settingValue: setting.setting_value ?? undefined,
        updatedAt: setting.updated_at
          ? new Date(setting.updated_at).getTime()
          : Date.now(),
      });
      imported++;
    }

    return { imported };
  },
});

/**
 * Import daily summaries.
 */
export const importDailySummaries = internalMutation({
  args: {
    deviceIdMap: v.record(v.string(), v.string()),
    summaries: v.array(supabaseDailySummaryValidator),
  },
  handler: async (ctx, args) => {
    let imported = 0;

    for (const summary of args.summaries) {
      const newDeviceId = args.deviceIdMap[summary.device_id];
      if (!newDeviceId) continue;

      // Extract just the date part
      const dateStr = summary.date.substring(0, 10); // "YYYY-MM-DD"

      // Check for existing (idempotent)
      const existing = await ctx.db
        .query("dailySummaries")
        .withIndex("by_deviceId_date", (q) =>
          q.eq("deviceId", newDeviceId as any).eq("date", dateStr)
        )
        .first();

      if (existing) continue;

      await ctx.db.insert("dailySummaries", {
        deviceId: newDeviceId as any,
        date: dateStr,
        avgBatteryLevel: summary.avg_battery_level ?? undefined,
        totalEnergyIn: summary.total_energy_in ?? undefined,
        totalEnergyOut: summary.total_energy_out ?? undefined,
        maxTemperature: summary.max_temperature ?? undefined,
        minTemperature: summary.min_temperature ?? undefined,
        totalRuntime: summary.total_runtime ?? undefined,
      });
      imported++;
    }

    return { imported };
  },
});

/**
 * Import alerts.
 */
export const importAlerts = internalMutation({
  args: {
    deviceIdMap: v.record(v.string(), v.string()),
    alerts: v.array(supabaseAlertValidator),
  },
  handler: async (ctx, args) => {
    let imported = 0;

    for (const alert of args.alerts) {
      const newDeviceId = args.deviceIdMap[alert.device_id];
      if (!newDeviceId) continue;

      await ctx.db.insert("alerts", {
        deviceId: newDeviceId as any,
        type: alert.type,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        isRead: alert.is_read ?? false,
        createdAt: alert.created_at
          ? new Date(alert.created_at).getTime()
          : Date.now(),
      });
      imported++;
    }

    return { imported };
  },
});

/**
 * Create default settings for the migrated user.
 */
export const createDefaultSettings = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Data retention settings
    const existingRetention = await ctx.db
      .query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!existingRetention) {
      await ctx.db.insert("dataRetentionSettings", {
        userId: args.userId,
        retentionPeriodDays: 90,
        autoCleanupEnabled: true,
        backupEnabled: false,
        collectionIntervalMinutes: 1,
      });
    }

    // Notification settings
    const existingNotification = await ctx.db
      .query("notificationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!existingNotification) {
      await ctx.db.insert("notificationSettings", {
        userId: args.userId,
        deviceAlerts: true,
        lowBattery: true,
        powerThreshold: false,
        systemUpdates: true,
        weeklyReports: false,
        emailNotifications: true,
        pushNotifications: false,
        lowBatteryThreshold: 20,
        powerThresholdWatts: 1500,
      });
    }

    // Session settings
    const existingSession = await ctx.db
      .query("sessionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!existingSession) {
      await ctx.db.insert("sessionSettings", {
        userId: args.userId,
        sessionTimeoutMinutes: 480,
        autoLogoutEnabled: true,
        rememberMeDurationDays: 30,
        forceLogoutOnNewDevice: false,
      });
    }

    return { success: true };
  },
});

// ─── Orchestrating action ────────────────────────────────────────────────────

/**
 * Main migration action. Call from the Convex dashboard or CLI.
 *
 * Prerequisites:
 * 1. Sign up via the app UI first (creates your Convex Auth user).
 * 2. Export Supabase data using the export script (scripts/export-supabase.ts).
 * 3. Run this action with the userId and exported JSON data.
 *
 * Usage from Convex dashboard Actions tab:
 *   migrations:runMigration({ userId: "<your_convex_user_id>", data: { ... } })
 */
export const runMigration = action({
  args: {
    userId: v.id("users"),
    data: v.object({
      devices: v.array(supabaseDeviceValidator),
      readings: v.optional(v.array(supabaseReadingValidator)),
      settings: v.optional(v.array(supabaseSettingValidator)),
      dailySummaries: v.optional(v.array(supabaseDailySummaryValidator)),
      alerts: v.optional(v.array(supabaseAlertValidator)),
    }),
  },
  handler: async (ctx, args) => {
    const results: Record<string, unknown> = {};

    // Step 1: Import devices and get ID mapping
    console.log(`[Migration] Importing ${args.data.devices.length} devices...`);
    const deviceIdMap = await ctx.runMutation(
      internal.migrations.importDevices,
      { userId: args.userId, devices: args.data.devices }
    );
    results.devices = {
      count: args.data.devices.length,
      mapped: Object.keys(deviceIdMap).length,
    };
    console.log(`[Migration] Device ID mapping:`, deviceIdMap);

    // Step 2: Import readings in batches (Convex mutations have limits)
    if (args.data.readings && args.data.readings.length > 0) {
      const BATCH_SIZE = 100;
      let totalImported = 0;
      let totalSkipped = 0;

      for (let i = 0; i < args.data.readings.length; i += BATCH_SIZE) {
        const batch = args.data.readings.slice(i, i + BATCH_SIZE);
        console.log(
          `[Migration] Importing readings batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(args.data.readings.length / BATCH_SIZE)}...`
        );
        const batchResult = await ctx.runMutation(
          internal.migrations.importReadingsBatch,
          { deviceIdMap, readings: batch }
        );
        totalImported += batchResult.imported;
        totalSkipped += batchResult.skipped;
      }

      results.readings = {
        total: args.data.readings.length,
        imported: totalImported,
        skipped: totalSkipped,
      };
    }

    // Step 3: Import device settings
    if (args.data.settings && args.data.settings.length > 0) {
      console.log(
        `[Migration] Importing ${args.data.settings.length} settings...`
      );
      const settingsResult = await ctx.runMutation(
        internal.migrations.importSettings,
        { deviceIdMap, settings: args.data.settings }
      );
      results.settings = settingsResult;
    }

    // Step 4: Import daily summaries
    if (args.data.dailySummaries && args.data.dailySummaries.length > 0) {
      console.log(
        `[Migration] Importing ${args.data.dailySummaries.length} daily summaries...`
      );
      const summariesResult = await ctx.runMutation(
        internal.migrations.importDailySummaries,
        { deviceIdMap, summaries: args.data.dailySummaries }
      );
      results.dailySummaries = summariesResult;
    }

    // Step 5: Import alerts
    if (args.data.alerts && args.data.alerts.length > 0) {
      console.log(
        `[Migration] Importing ${args.data.alerts.length} alerts...`
      );
      const alertsResult = await ctx.runMutation(
        internal.migrations.importAlerts,
        { deviceIdMap, alerts: args.data.alerts }
      );
      results.alerts = alertsResult;
    }

    // Step 6: Create default settings for the user
    console.log(`[Migration] Creating default user settings...`);
    await ctx.runMutation(internal.migrations.createDefaultSettings, {
      userId: args.userId,
    });
    results.defaultSettings = { created: true };

    console.log(`[Migration] Complete!`, results);
    return results;
  },
});
