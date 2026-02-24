import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { internal } from "./_generated/api";

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * List all devices for the current user.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const devices = await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    return devices.map((d) => ({
      id: d._id,
      deviceSn: d.deviceSn,
      deviceName: d.deviceName ?? "EcoFlow Device",
      deviceType: d.deviceType,
      isActive: d.isActive,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  },
});

/**
 * Get a single device by its Convex ID.
 */
export const get = query({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) return null;

    return {
      id: device._id,
      deviceSn: device.deviceSn,
      deviceName: device.deviceName ?? "EcoFlow Device",
      deviceType: device.deviceType,
      isActive: device.isActive,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  },
});

/**
 * Get a device by its serial number (for the current user).
 */
export const getBySn = query({
  args: { deviceSn: v.string() },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const device = await ctx.db
      .query("devices")
      .withIndex("by_deviceSn", (q) => q.eq("deviceSn", args.deviceSn))
      .first();

    if (!device || device.userId !== userId) return null;

    return {
      id: device._id,
      deviceSn: device.deviceSn,
      deviceName: device.deviceName ?? "EcoFlow Device",
      deviceType: device.deviceType,
      isActive: device.isActive,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Register a new device for the current user.
 */
export const create = mutation({
  args: {
    deviceSn: v.string(),
    deviceName: v.optional(v.string()),
    deviceType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    // Check if device already exists
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_deviceSn", (q) => q.eq("deviceSn", args.deviceSn))
      .first();

    if (existing) {
      throw new Error(`Device with serial number ${args.deviceSn} is already registered`);
    }

    const now = Date.now();
    const deviceId = await ctx.db.insert("devices", {
      userId,
      deviceSn: args.deviceSn,
      deviceName: args.deviceName ?? "EcoFlow Device",
      deviceType: args.deviceType ?? "DELTA_2",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return deviceId;
  },
});

/**
 * Update a device's name or active status.
 */
export const update = mutation({
  args: {
    deviceId: v.id("devices"),
    deviceName: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) {
      throw new Error("Device not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.deviceName !== undefined) updates.deviceName = args.deviceName;
    if (args.isActive !== undefined) updates.isActive = args.isActive;

    await ctx.db.patch(args.deviceId, updates);
    return { success: true };
  },
});

/**
 * Delete (unregister) a device and all its associated data.
 */
export const remove = mutation({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) {
      throw new Error("Device not found");
    }

    // Delete related readings
    const readings = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .collect();
    for (const r of readings) {
      await ctx.db.delete(r._id);
    }

    // Delete related settings
    const settings = await ctx.db
      .query("deviceSettings")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .collect();
    for (const s of settings) {
      await ctx.db.delete(s._id);
    }

    // Delete related alerts
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .collect();
    for (const a of alerts) {
      await ctx.db.delete(a._id);
    }

    // Delete related daily summaries
    const summaries = await ctx.db
      .query("dailySummaries")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .collect();
    for (const s of summaries) {
      await ctx.db.delete(s._id);
    }

    // Delete the device itself
    await ctx.db.delete(args.deviceId);

    return { success: true };
  },
});

// ─── Internal Functions (for cron jobs) ──────────────────────────────────────

/**
 * Check device alerts — called by the device-monitor cron.
 * Iterates all active devices, gets latest reading, creates alerts if needed.
 */
export const checkDeviceAlerts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allDevices = await ctx.db.query("devices").collect();
    let alertsCreated = 0;

    for (const device of allDevices) {
      if (!device.isActive) continue;

      // Get the latest reading for this device
      const latestReading = await ctx.db
        .query("deviceReadings")
        .withIndex("by_deviceId_recordedAt", (q) => q.eq("deviceId", device._id))
        .order("desc")
        .first();

      if (!latestReading) continue;

      // Get user's notification settings
      const notifSettings = await ctx.db
        .query("notificationSettings")
        .withIndex("by_userId", (q) => q.eq("userId", device.userId))
        .first();

      const now = Date.now();

      // Check low battery
      if (
        notifSettings?.lowBattery &&
        latestReading.batteryLevel !== undefined &&
        latestReading.batteryLevel !== null &&
        latestReading.batteryLevel < (notifSettings.lowBatteryThreshold ?? 20)
      ) {
        // Avoid duplicate alerts: check if a low-battery alert was created in the last hour
        const recentAlert = await ctx.db
          .query("alerts")
          .withIndex("by_deviceId_createdAt", (q) =>
            q.eq("deviceId", device._id).gte("createdAt", now - 60 * 60 * 1000)
          )
          .filter((q) => q.eq(q.field("type"), "BATTERY_LOW"))
          .first();

        if (!recentAlert) {
          await ctx.db.insert("alerts", {
            deviceId: device._id,
            type: "BATTERY_LOW",
            title: "Low Battery",
            message: `${device.deviceName ?? device.deviceSn} battery is at ${latestReading.batteryLevel}%`,
            severity: latestReading.batteryLevel < 10 ? "CRITICAL" : "HIGH",
            isRead: false,
            createdAt: now,
          });
          alertsCreated++;
        }
      }

      // Check high temperature
      if (
        latestReading.temperature !== undefined &&
        latestReading.temperature !== null &&
        latestReading.temperature > 45
      ) {
        const recentAlert = await ctx.db
          .query("alerts")
          .withIndex("by_deviceId_createdAt", (q) =>
            q.eq("deviceId", device._id).gte("createdAt", now - 60 * 60 * 1000)
          )
          .filter((q) => q.eq(q.field("type"), "TEMPERATURE_HIGH"))
          .first();

        if (!recentAlert) {
          await ctx.db.insert("alerts", {
            deviceId: device._id,
            type: "TEMPERATURE_HIGH",
            title: "High Temperature",
            message: `${device.deviceName ?? device.deviceSn} temperature is ${latestReading.temperature}°C`,
            severity: latestReading.temperature > 55 ? "CRITICAL" : "HIGH",
            isRead: false,
            createdAt: now,
          });
          alertsCreated++;
        }
      }

      // Check if device appears offline (no readings in last 30 minutes)
      if (latestReading.recordedAt < now - 30 * 60 * 1000) {
        const recentAlert = await ctx.db
          .query("alerts")
          .withIndex("by_deviceId_createdAt", (q) =>
            q.eq("deviceId", device._id).gte("createdAt", now - 2 * 60 * 60 * 1000)
          )
          .filter((q) => q.eq(q.field("type"), "DEVICE_OFFLINE"))
          .first();

        if (!recentAlert) {
          await ctx.db.insert("alerts", {
            deviceId: device._id,
            type: "DEVICE_OFFLINE",
            title: "Device Offline",
            message: `${device.deviceName ?? device.deviceSn} hasn't reported data in over 30 minutes`,
            severity: "MEDIUM",
            isRead: false,
            createdAt: now,
          });
          alertsCreated++;
        }
      }
    }

    return { alertsCreated };
  },
});
