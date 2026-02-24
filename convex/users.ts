import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

/**
 * Get the current user's profile.
 * Creates a profile entry if it doesn't exist yet (first login).
 */
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return null;

    return {
      id: user._id,
      email: user.email ?? "",
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      createdAt: user.createdAt ?? user._creationTime,
      updatedAt: user.updatedAt ?? null,
    };
  },
});

/**
 * Update the current user's profile (first name / last name).
 */
export const updateProfile = mutation({
  args: {
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    await ctx.db.patch(userId, {
      firstName: args.firstName ?? undefined,
      lastName: args.lastName ?? undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});
