import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Log an email notification result to the notificationLogs table.
 * Called from the email action after sending an email.
 */
export const logNotification = internalMutation({
  args: {
    userId: v.id("users"),
    type: v.string(),
    email: v.optional(v.string()),
    deviceId: v.optional(v.id("devices")),
    subject: v.optional(v.string()),
    messageId: v.optional(v.string()),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("notificationLogs", {
      userId: args.userId,
      type: args.type,
      email: args.email,
      deviceId: args.deviceId,
      subject: args.subject,
      messageId: args.messageId,
      status: args.status,
      errorMessage: args.errorMessage,
      sentAt: Date.now(),
    });
  },
});

// ─── Test email attempts ─────────────────────────────────────────────────────

/** Atomically resolve the authenticated account and reserve its send interval. */
export const claimTestEmailAttempt = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = await ctx.db.get(userId);
    const email = user?.email?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { allowed: false as const, error: "Your account does not have a valid email address." };
    }
    const now = Date.now();
    const recentAttempt = await ctx.db.query("notificationLogs")
      .withIndex("by_userId_type_sentAt", (q) => q.eq("userId", userId)
        .eq("type", "test_email").gt("sentAt", now - 60_000))
      .first();
    if (recentAttempt) {
      return { allowed: false as const, error: "Please wait a minute before sending another test email." };
    }
    // The indexed range read and insert share a mutation. Concurrent browser
    // sessions conflict and retry, so only one can reserve this interval.
    const logId = await ctx.db.insert("notificationLogs", {
      userId, type: "test_email", email,
      subject: "EcoFlow Dashboard email test", status: "pending", sentAt: now,
    });
    return { allowed: true as const, email, firstName: user?.firstName ?? user?.name, logId };
  },
});

/** Record provider acceptance or failure on the original rate-limit attempt. */
export const finishTestEmailAttempt = internalMutation({
  args: {
    logId: v.id("notificationLogs"),
    userId: v.id("users"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    messageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.logId);
    if (!log || log.userId !== args.userId || log.type !== "test_email") {
      throw new Error("Test email attempt unavailable");
    }
    if (log.status !== "pending") return null;
    await ctx.db.patch(args.logId, {
      status: args.status, messageId: args.messageId, errorMessage: args.errorMessage,
    });
    return null;
  },
});
