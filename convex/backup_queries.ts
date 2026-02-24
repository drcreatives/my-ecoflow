import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get a user record by ID (for backup email).
 */
export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.userId);
  },
});

/**
 * Get device readings within a time range (for backup data).
 */
export const getDeviceReadingsInRange = internalQuery({
  args: {
    deviceId: v.id("devices"),
    startTime: v.float64(),
    endTime: v.float64(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_recordedAt", (q) =>
        q
          .eq("deviceId", args.deviceId)
          .gte("recordedAt", args.startTime)
          .lte("recordedAt", args.endTime)
      )
      .collect();
  },
});
