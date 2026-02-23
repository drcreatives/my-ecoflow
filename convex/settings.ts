import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

// ═══════════════════════════════════════════════════════════════════════════════
// Data Retention Settings
// ═══════════════════════════════════════════════════════════════════════════════

const DATA_RETENTION_DEFAULTS = {
  retentionPeriodDays: 90,
  autoCleanupEnabled: true,
  backupEnabled: false,
  collectionIntervalMinutes: 5,
};

export const getDataRetention = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const settings = await ctx.db
      .query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!settings) {
      return { ...DATA_RETENTION_DEFAULTS, userId };
    }

    return {
      retentionPeriodDays: settings.retentionPeriodDays,
      autoCleanupEnabled: settings.autoCleanupEnabled,
      backupEnabled: settings.backupEnabled,
      collectionIntervalMinutes: settings.collectionIntervalMinutes,
    };
  },
});

export const updateDataRetention = mutation({
  args: {
    retentionPeriodDays: v.optional(v.float64()),
    autoCleanupEnabled: v.optional(v.boolean()),
    backupEnabled: v.optional(v.boolean()),
    collectionIntervalMinutes: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const values = {
      retentionPeriodDays:
        args.retentionPeriodDays ??
        existing?.retentionPeriodDays ??
        DATA_RETENTION_DEFAULTS.retentionPeriodDays,
      autoCleanupEnabled:
        args.autoCleanupEnabled ??
        existing?.autoCleanupEnabled ??
        DATA_RETENTION_DEFAULTS.autoCleanupEnabled,
      backupEnabled:
        args.backupEnabled ??
        existing?.backupEnabled ??
        DATA_RETENTION_DEFAULTS.backupEnabled,
      collectionIntervalMinutes:
        args.collectionIntervalMinutes ??
        existing?.collectionIntervalMinutes ??
        DATA_RETENTION_DEFAULTS.collectionIntervalMinutes,
    };

    if (existing) {
      await ctx.db.patch(existing._id, values);
    } else {
      await ctx.db.insert("dataRetentionSettings", { userId, ...values });
    }

    return { success: true };
  },
});

/**
 * Internal: get ALL data retention settings for the cron job.
 */
export const getAllDataRetentionSettings = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db.query("dataRetentionSettings").collect();
  },
});

/**
 * Internal: update lastCollectionAt after cron collection.
 */
export const updateLastCollection = internalMutation({
  args: {
    userId: v.id("users"),
    timestamp: v.float64(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { lastCollectionAt: args.timestamp });
    } else {
      // Create default settings with the timestamp
      await ctx.db.insert("dataRetentionSettings", {
        userId: args.userId,
        ...DATA_RETENTION_DEFAULTS,
        lastCollectionAt: args.timestamp,
      });
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Notification Settings
// ═══════════════════════════════════════════════════════════════════════════════

const NOTIFICATION_DEFAULTS = {
  deviceAlerts: true,
  lowBattery: true,
  powerThreshold: false,
  systemUpdates: true,
  weeklyReports: false,
  emailNotifications: true,
  pushNotifications: false,
  lowBatteryThreshold: 20,
  powerThresholdWatts: 1800,
};

export const getNotifications = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const settings = await ctx.db
      .query("notificationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    return settings ?? { ...NOTIFICATION_DEFAULTS, userId };
  },
});

export const updateNotifications = mutation({
  args: {
    deviceAlerts: v.optional(v.boolean()),
    lowBattery: v.optional(v.boolean()),
    powerThreshold: v.optional(v.boolean()),
    systemUpdates: v.optional(v.boolean()),
    weeklyReports: v.optional(v.boolean()),
    emailNotifications: v.optional(v.boolean()),
    pushNotifications: v.optional(v.boolean()),
    lowBatteryThreshold: v.optional(v.float64()),
    powerThresholdWatts: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("notificationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const values = {
      deviceAlerts: args.deviceAlerts ?? existing?.deviceAlerts ?? NOTIFICATION_DEFAULTS.deviceAlerts,
      lowBattery: args.lowBattery ?? existing?.lowBattery ?? NOTIFICATION_DEFAULTS.lowBattery,
      powerThreshold: args.powerThreshold ?? existing?.powerThreshold ?? NOTIFICATION_DEFAULTS.powerThreshold,
      systemUpdates: args.systemUpdates ?? existing?.systemUpdates ?? NOTIFICATION_DEFAULTS.systemUpdates,
      weeklyReports: args.weeklyReports ?? existing?.weeklyReports ?? NOTIFICATION_DEFAULTS.weeklyReports,
      emailNotifications: args.emailNotifications ?? existing?.emailNotifications ?? NOTIFICATION_DEFAULTS.emailNotifications,
      pushNotifications: args.pushNotifications ?? existing?.pushNotifications ?? NOTIFICATION_DEFAULTS.pushNotifications,
      lowBatteryThreshold: args.lowBatteryThreshold ?? existing?.lowBatteryThreshold ?? NOTIFICATION_DEFAULTS.lowBatteryThreshold,
      powerThresholdWatts: args.powerThresholdWatts ?? existing?.powerThresholdWatts ?? NOTIFICATION_DEFAULTS.powerThresholdWatts,
    };

    if (existing) {
      await ctx.db.patch(existing._id, values);
    } else {
      await ctx.db.insert("notificationSettings", { userId, ...values });
    }

    return { success: true };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// Session Settings
// ═══════════════════════════════════════════════════════════════════════════════

const SESSION_DEFAULTS = {
  sessionTimeoutMinutes: 480,
  autoLogoutEnabled: false,
  rememberMeDurationDays: 30,
  forceLogoutOnNewDevice: false,
};

export const getSession = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const settings = await ctx.db
      .query("sessionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    return settings ?? { ...SESSION_DEFAULTS, userId };
  },
});

export const updateSession = mutation({
  args: {
    sessionTimeoutMinutes: v.optional(v.float64()),
    autoLogoutEnabled: v.optional(v.boolean()),
    rememberMeDurationDays: v.optional(v.float64()),
    forceLogoutOnNewDevice: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("sessionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const values = {
      sessionTimeoutMinutes:
        args.sessionTimeoutMinutes ?? existing?.sessionTimeoutMinutes ?? SESSION_DEFAULTS.sessionTimeoutMinutes,
      autoLogoutEnabled:
        args.autoLogoutEnabled ?? existing?.autoLogoutEnabled ?? SESSION_DEFAULTS.autoLogoutEnabled,
      rememberMeDurationDays:
        args.rememberMeDurationDays ?? existing?.rememberMeDurationDays ?? SESSION_DEFAULTS.rememberMeDurationDays,
      forceLogoutOnNewDevice:
        args.forceLogoutOnNewDevice ?? existing?.forceLogoutOnNewDevice ?? SESSION_DEFAULTS.forceLogoutOnNewDevice,
    };

    if (existing) {
      await ctx.db.patch(existing._id, values);
    } else {
      await ctx.db.insert("sessionSettings", { userId, ...values });
    }

    return { success: true };
  },
});
