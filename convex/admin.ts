import { internalMutation } from "./_generated/server";

/**
 * Clean up old readings, alerts, and notification logs based on each user's
 * retention settings. Called by the daily cron job.
 */
export const cleanupOldReadings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allSettings = await ctx.db.query("dataRetentionSettings").collect();
    const now = Date.now();
    let totalDeleted = 0;

    for (const settings of allSettings) {
      if (!settings.autoCleanupEnabled) continue;

      const cutoffMs = now - settings.retentionPeriodDays * 24 * 60 * 60 * 1000;

      // Get user's devices
      const devices = await ctx.db
        .query("devices")
        .withIndex("by_userId", (q) => q.eq("userId", settings.userId))
        .collect();

      for (const device of devices) {
        // Delete old readings
        const oldReadings = await ctx.db
          .query("deviceReadings")
          .withIndex("by_deviceId_recordedAt", (q) =>
            q.eq("deviceId", device._id).lt("recordedAt", cutoffMs)
          )
          .collect();

        for (const r of oldReadings) {
          await ctx.db.delete(r._id);
          totalDeleted++;
        }

        // Delete old alerts
        const oldAlerts = await ctx.db
          .query("alerts")
          .withIndex("by_deviceId_createdAt", (q) =>
            q.eq("deviceId", device._id).lt("createdAt", cutoffMs)
          )
          .collect();

        for (const a of oldAlerts) {
          await ctx.db.delete(a._id);
          totalDeleted++;
        }
      }

      // Delete old notification logs for this user
      const oldLogs = await ctx.db
        .query("notificationLogs")
        .withIndex("by_userId_sentAt", (q) =>
          q.eq("userId", settings.userId).lt("sentAt", cutoffMs)
        )
        .collect();

      for (const log of oldLogs) {
        await ctx.db.delete(log._id);
        totalDeleted++;
      }

      // Update last cleanup timestamp
      await ctx.db.patch(settings._id, { lastCleanup: now });
    }

    console.log(`Data cleanup complete: ${totalDeleted} records deleted`);
    return { totalDeleted };
  },
});
