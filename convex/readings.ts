import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Id } from "./_generated/dataModel";

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get the latest reading for each of the current user's devices.
 */
export const latest = query({
  args: {},
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return [];

    const devices = await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const results = [];
    for (const device of devices) {
      const reading = await ctx.db
        .query("deviceReadings")
        .withIndex("by_deviceId_recordedAt", (q) => q.eq("deviceId", device._id))
        .order("desc")
        .first();

      results.push({
        deviceId: device._id,
        deviceSn: device.deviceSn,
        deviceName: device.deviceName ?? "EcoFlow Device",
        deviceType: device.deviceType,
        isActive: device.isActive,
        reading: reading
          ? {
              batteryLevel: reading.batteryLevel ?? null,
              inputWatts: reading.inputWatts ?? null,
              acInputWatts: reading.acInputWatts ?? null,
              dcInputWatts: reading.dcInputWatts ?? null,
              chargingType: reading.chargingType ?? null,
              outputWatts: reading.outputWatts ?? null,
              acOutputWatts: reading.acOutputWatts ?? null,
              dcOutputWatts: reading.dcOutputWatts ?? null,
              usbOutputWatts: reading.usbOutputWatts ?? null,
              remainingTime: reading.remainingTime ?? null,
              temperature: reading.temperature ?? null,
              status: reading.status ?? "unknown",
              recordedAt: reading.recordedAt,
            }
          : null,
      });
    }

    return results;
  },
});

/**
 * Get a single device's latest reading.
 */
export const latestForDevice = query({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;

    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) return null;

    const reading = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_recordedAt", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .first();

    return reading
      ? {
          batteryLevel: reading.batteryLevel ?? null,
          inputWatts: reading.inputWatts ?? null,
          acInputWatts: reading.acInputWatts ?? null,
          dcInputWatts: reading.dcInputWatts ?? null,
          chargingType: reading.chargingType ?? null,
          outputWatts: reading.outputWatts ?? null,
          acOutputWatts: reading.acOutputWatts ?? null,
          dcOutputWatts: reading.dcOutputWatts ?? null,
          usbOutputWatts: reading.usbOutputWatts ?? null,
          remainingTime: reading.remainingTime ?? null,
          temperature: reading.temperature ?? null,
          status: reading.status ?? "unknown",
          recordedAt: reading.recordedAt,
        }
      : null;
  },
});

/**
 * Get historical readings for a device within a time range.
 * Supports optional time-bucket aggregation for chart rendering.
 */
export const history = query({
  args: {
    deviceId: v.optional(v.id("devices")),
    startTime: v.float64(), // epoch ms
    endTime: v.float64(), // epoch ms
    limit: v.optional(v.float64()),
    aggregation: v.optional(v.string()), // "raw" | "5m" | "15m" | "1h" | "1d"
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return { readings: [], summary: null };

    // Get user's devices to scope the query
    const userDevices = await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const deviceIds = args.deviceId
      ? [args.deviceId]
      : userDevices.map((d) => d._id);

    // Verify ownership if a specific device was requested
    if (args.deviceId) {
      const owned = userDevices.some((d) => d._id === args.deviceId);
      if (!owned) return { readings: [], summary: null };
    }

    const limit = args.limit ?? 1000;
    const allReadings: Array<{
      deviceId: Id<"devices">;
      deviceName: string;
      deviceSn: string;
      batteryLevel: number | null;
      inputWatts: number | null;
      acInputWatts: number | null;
      dcInputWatts: number | null;
      chargingType: number | null;
      outputWatts: number | null;
      acOutputWatts: number | null;
      dcOutputWatts: number | null;
      usbOutputWatts: number | null;
      remainingTime: number | null;
      temperature: number | null;
      status: string;
      recordedAt: number;
    }> = [];

    // Build a map of deviceId -> device info
    const deviceMap = new Map(userDevices.map((d) => [d._id, d]));

    for (const devId of deviceIds) {
      const device = deviceMap.get(devId);
      if (!device) continue;

      const readings = await ctx.db
        .query("deviceReadings")
        .withIndex("by_deviceId_recordedAt", (q) =>
          q
            .eq("deviceId", devId)
            .gte("recordedAt", args.startTime)
            .lte("recordedAt", args.endTime)
        )
        .order("asc")
        .collect();

      for (const r of readings) {
        allReadings.push({
          deviceId: r.deviceId,
          deviceName: device.deviceName ?? "EcoFlow Device",
          deviceSn: device.deviceSn,
          batteryLevel: r.batteryLevel ?? null,
          inputWatts: r.inputWatts ?? null,
          acInputWatts: r.acInputWatts ?? null,
          dcInputWatts: r.dcInputWatts ?? null,
          chargingType: r.chargingType ?? null,
          outputWatts: r.outputWatts ?? null,
          acOutputWatts: r.acOutputWatts ?? null,
          dcOutputWatts: r.dcOutputWatts ?? null,
          usbOutputWatts: r.usbOutputWatts ?? null,
          remainingTime: r.remainingTime ?? null,
          temperature: r.temperature ?? null,
          status: r.status ?? "unknown",
          recordedAt: r.recordedAt,
        });
      }
    }

    // If aggregation is requested, bucket the data
    const agg = args.aggregation ?? "raw";
    const finalReadings = agg === "raw" ? allReadings : aggregateReadings(allReadings, agg);

    // Compute summary
    const summary = computeSummary(finalReadings, args.startTime, args.endTime);

    return { readings: finalReadings, summary };
  },
});

/**
 * Get reading count for a device (for dashboard stats).
 */
export const count = query({
  args: { deviceId: v.optional(v.id("devices")) },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return 0;

    if (args.deviceId) {
      const device = await ctx.db.get(args.deviceId);
      if (!device || device.userId !== userId) return 0;

      const readings = await ctx.db
        .query("deviceReadings")
        .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId!))
        .collect();
      return readings.length;
    }

    // Count all readings across user's devices
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    let total = 0;
    for (const device of devices) {
      const readings = await ctx.db
        .query("deviceReadings")
        .withIndex("by_deviceId", (q) => q.eq("deviceId", device._id))
        .collect();
      total += readings.length;
    }
    return total;
  },
});

// ─── Internal Mutations (for cron / ecoflow action) ──────────────────────────

/**
 * Insert a single reading — called from the ecoflow action after fetching quota.
 */
export const insertReading = internalMutation({
  args: {
    deviceId: v.id("devices"),
    batteryLevel: v.optional(v.float64()),
    inputWatts: v.optional(v.float64()),
    acInputWatts: v.optional(v.float64()),
    dcInputWatts: v.optional(v.float64()),
    chargingType: v.optional(v.float64()),
    outputWatts: v.optional(v.float64()),
    acOutputWatts: v.optional(v.float64()),
    dcOutputWatts: v.optional(v.float64()),
    usbOutputWatts: v.optional(v.float64()),
    remainingTime: v.optional(v.float64()),
    temperature: v.optional(v.float64()),
    status: v.optional(v.string()),
    rawData: v.optional(v.any()),
    recordedAt: v.float64(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("deviceReadings", {
      deviceId: args.deviceId,
      batteryLevel: args.batteryLevel,
      inputWatts: args.inputWatts,
      acInputWatts: args.acInputWatts,
      dcInputWatts: args.dcInputWatts,
      chargingType: args.chargingType,
      outputWatts: args.outputWatts,
      acOutputWatts: args.acOutputWatts,
      dcOutputWatts: args.dcOutputWatts,
      usbOutputWatts: args.usbOutputWatts,
      remainingTime: args.remainingTime,
      temperature: args.temperature,
      status: args.status,
      rawData: args.rawData,
      recordedAt: args.recordedAt,
    });
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ReadingRow {
  batteryLevel: number | null;
  inputWatts: number | null;
  acInputWatts: number | null;
  dcInputWatts: number | null;
  chargingType: number | null;
  outputWatts: number | null;
  acOutputWatts: number | null;
  dcOutputWatts: number | null;
  usbOutputWatts: number | null;
  remainingTime: number | null;
  temperature: number | null;
  status: string;
  recordedAt: number;
  [key: string]: unknown;
}

function aggregateReadings(readings: ReadingRow[], bucket: string): ReadingRow[] {
  const bucketMs =
    bucket === "5m"
      ? 5 * 60 * 1000
      : bucket === "15m"
        ? 15 * 60 * 1000
        : bucket === "1h"
          ? 60 * 60 * 1000
          : bucket === "1d"
            ? 24 * 60 * 60 * 1000
            : 5 * 60 * 1000;

  const buckets = new Map<number, ReadingRow[]>();

  for (const r of readings) {
    const key = Math.floor(r.recordedAt / bucketMs) * bucketMs;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const result: ReadingRow[] = [];
  for (const [bucketStart, items] of buckets) {
    const avg = (field: keyof ReadingRow) => {
      const vals = items
        .map((i) => i[field] as number | null)
        .filter((v): v is number => v !== null && v !== undefined);
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    result.push({
      ...items[0],
      batteryLevel: avg("batteryLevel"),
      inputWatts: avg("inputWatts"),
      acInputWatts: avg("acInputWatts"),
      dcInputWatts: avg("dcInputWatts"),
      chargingType: items[0].chargingType,
      outputWatts: avg("outputWatts"),
      acOutputWatts: avg("acOutputWatts"),
      dcOutputWatts: avg("dcOutputWatts"),
      usbOutputWatts: avg("usbOutputWatts"),
      remainingTime: avg("remainingTime"),
      temperature: avg("temperature"),
      status: items[items.length - 1].status,
      recordedAt: bucketStart,
    });
  }

  return result.sort((a, b) => a.recordedAt - b.recordedAt);
}

function computeSummary(readings: ReadingRow[], startTime: number, endTime: number) {
  if (readings.length === 0) return null;

  const batteryLevels = readings
    .map((r) => r.batteryLevel)
    .filter((v): v is number => v !== null);
  const outputValues = readings
    .map((r) => r.outputWatts)
    .filter((v): v is number => v !== null);
  const tempValues = readings
    .map((r) => r.temperature)
    .filter((v): v is number => v !== null);

  return {
    totalReadings: readings.length,
    avgBatteryLevel:
      batteryLevels.length > 0
        ? Math.round(
            (batteryLevels.reduce((a, b) => a + b, 0) / batteryLevels.length) * 100
          ) / 100
        : 0,
    avgPowerOutput:
      outputValues.length > 0
        ? Math.round(
            (outputValues.reduce((a, b) => a + b, 0) / outputValues.length) * 100
          ) / 100
        : 0,
    avgTemperature:
      tempValues.length > 0
        ? Math.round(
            (tempValues.reduce((a, b) => a + b, 0) / tempValues.length) * 100
          ) / 100
        : 0,
    peakPowerOutput: outputValues.length > 0 ? Math.max(...outputValues) : 0,
    lowestBatteryLevel: batteryLevels.length > 0 ? Math.min(...batteryLevels) : 0,
    highestTemperature: tempValues.length > 0 ? Math.max(...tempValues) : 0,
    startTime,
    endTime,
  };
}
