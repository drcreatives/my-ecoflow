import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal query to list devices by userId.
 * Used by the ecoflow cron action — not exposed to the client.
 */
export const listByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

/**
 * Internal query to get a device by SN for a specific user.
 * Used by device control actions to validate ownership.
 */
export const getBySnForUser = internalQuery({
  args: { deviceSn: v.string(), userId: v.id("users") },
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_deviceSn", (q) => q.eq("deviceSn", args.deviceSn))
      .first();

    if (!device || device.userId !== args.userId) return null;
    return device;
  },
});

/**
 * Internal query to get a device by its Convex ID.
 * Used by the schedule processor to look up device SN.
 */
export const getById = internalQuery({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.deviceId);
  },
});
