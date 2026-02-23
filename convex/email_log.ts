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
    await ctx.db.insert("notificationLogs", {
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
