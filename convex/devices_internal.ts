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
