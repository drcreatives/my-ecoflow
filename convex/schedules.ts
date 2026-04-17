import { query, mutation, internalMutation } from "./_generated/server";
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";

const MAX_SCHEDULES_PER_DEVICE = 5;

const scheduleActionValidator = v.object({
  moduleType: v.float64(),
  operateType: v.string(),
  params: v.any(),
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export const list = query({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) return [];

    const schedules = await ctx.db
      .query("deviceSchedules")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .collect();

    return schedules.map((s) => ({
      id: s._id,
      deviceId: s.deviceId,
      name: s.name,
      enabled: s.enabled,
      time: s.time,
      daysOfWeek: s.daysOfWeek,
      action: s.action,
      timezone: s.timezone,
      lastExecutedAt: s.lastExecutedAt ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    deviceId: v.id("devices"),
    name: v.string(),
    time: v.string(),
    daysOfWeek: v.array(v.float64()),
    action: scheduleActionValidator,
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");

    // Enforce max schedules per device
    const existing = await ctx.db
      .query("deviceSchedules")
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId))
      .collect();
    if (existing.length >= MAX_SCHEDULES_PER_DEVICE) {
      throw new Error(`Maximum of ${MAX_SCHEDULES_PER_DEVICE} schedules per device`);
    }

    // Validate time format HH:MM with valid ranges
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time)) {
      throw new Error("Time must be in HH:MM format (00:00–23:59)");
    }

    const now = Date.now();
    return await ctx.db.insert("deviceSchedules", {
      deviceId: args.deviceId,
      userId,
      name: args.name,
      enabled: true,
      time: args.time,
      daysOfWeek: args.daysOfWeek,
      action: args.action,
      timezone: args.timezone,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    scheduleId: v.id("deviceSchedules"),
    name: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    time: v.optional(v.string()),
    daysOfWeek: v.optional(v.array(v.float64())),
    action: v.optional(scheduleActionValidator),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule || schedule.userId !== userId) throw new Error("Schedule not found");

    if (args.time !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time)) {
      throw new Error("Time must be in HH:MM format (00:00–23:59)");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.enabled !== undefined) updates.enabled = args.enabled;
    if (args.time !== undefined) updates.time = args.time;
    if (args.daysOfWeek !== undefined) updates.daysOfWeek = args.daysOfWeek;
    if (args.action !== undefined) updates.action = args.action;
    if (args.timezone !== undefined) updates.timezone = args.timezone;

    await ctx.db.patch(args.scheduleId, updates);
    return { success: true };
  },
});

export const remove = mutation({
  args: { scheduleId: v.id("deviceSchedules") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const schedule = await ctx.db.get(args.scheduleId);
    if (!schedule || schedule.userId !== userId) throw new Error("Schedule not found");

    await ctx.db.delete(args.scheduleId);
    return { success: true };
  },
});

// ─── Internal Functions (for cron) ───────────────────────────────────────────

export const listAllEnabled = internalQuery({
  args: {},
  handler: async (ctx) => {
    const allSchedules = await ctx.db.query("deviceSchedules").collect();
    return allSchedules.filter((s) => s.enabled);
  },
});

export const markExecuted = internalMutation({
  args: {
    scheduleId: v.id("deviceSchedules"),
    timestamp: v.float64(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.scheduleId, { lastExecutedAt: args.timestamp });
  },
});
