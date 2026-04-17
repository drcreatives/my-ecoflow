import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
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
              // Config state
              acEnabled: reading.acEnabled ?? null,
              dcOutEnabled: reading.dcOutEnabled ?? null,
              carChargerEnabled: reading.carChargerEnabled ?? null,
              acXboost: reading.acXboost ?? null,
              acOutVoltage: reading.acOutVoltage ?? null,
              acOutFrequency: reading.acOutFrequency ?? null,
              acChargingWatts: reading.acChargingWatts ?? null,
              dcChargingCurrent: reading.dcChargingCurrent ?? null,
              acStandbyMins: reading.acStandbyMins ?? null,
              carStandbyMins: reading.carStandbyMins ?? null,
              unitStandbyMins: reading.unitStandbyMins ?? null,
              maxChargeSoc: reading.maxChargeSoc ?? null,
              minDischargeSoc: reading.minDischargeSoc ?? null,
              solarPriority: reading.solarPriority ?? null,
              energyMgmtEnabled: reading.energyMgmtEnabled ?? null,
              backupReserveSoc: reading.backupReserveSoc ?? null,
              acAutoOutEnabled: reading.acAutoOutEnabled ?? null,
              minAcOutSoc: reading.minAcOutSoc ?? null,
              smartGenOnSoc: reading.smartGenOnSoc ?? null,
              smartGenOffSoc: reading.smartGenOffSoc ?? null,
              lcdOffSeconds: reading.lcdOffSeconds ?? null,
              buzzerSilent: reading.buzzerSilent ?? null,
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
          // Config state
          acEnabled: reading.acEnabled ?? null,
          dcOutEnabled: reading.dcOutEnabled ?? null,
          carChargerEnabled: reading.carChargerEnabled ?? null,
          acXboost: reading.acXboost ?? null,
          acOutVoltage: reading.acOutVoltage ?? null,
          acOutFrequency: reading.acOutFrequency ?? null,
          acChargingWatts: reading.acChargingWatts ?? null,
          dcChargingCurrent: reading.dcChargingCurrent ?? null,
          acStandbyMins: reading.acStandbyMins ?? null,
          carStandbyMins: reading.carStandbyMins ?? null,
          unitStandbyMins: reading.unitStandbyMins ?? null,
          maxChargeSoc: reading.maxChargeSoc ?? null,
          minDischargeSoc: reading.minDischargeSoc ?? null,
          solarPriority: reading.solarPriority ?? null,
          energyMgmtEnabled: reading.energyMgmtEnabled ?? null,
          backupReserveSoc: reading.backupReserveSoc ?? null,
          acAutoOutEnabled: reading.acAutoOutEnabled ?? null,
          minAcOutSoc: reading.minAcOutSoc ?? null,
          smartGenOnSoc: reading.smartGenOnSoc ?? null,
          smartGenOffSoc: reading.smartGenOffSoc ?? null,
          lcdOffSeconds: reading.lcdOffSeconds ?? null,
          buzzerSilent: reading.buzzerSilent ?? null,
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
    aggregation: v.optional(v.string()), // "raw" | "5m" | "15m" | "1h" | "1d"
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return { readings: [], summary: null };

    // Cap endTime to now to prevent reactive re-execution when new readings
    // are inserted in the future. This is the #1 bandwidth optimization.
    const effectiveEndTime = Math.min(args.endTime, Date.now());

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

    // Adaptive row cap: derive from the requested time span and expected
    // collection interval (~5 min) so long ranges (7d/30d) don't silently
    // drop older readings, while still capping bandwidth.
    const agg = args.aggregation ?? "raw";
    let rowCap: number;
    if (agg === "raw") {
      rowCap = 4000;
    } else {
      const durationMs = effectiveEndTime - args.startTime;
      const approxIntervalMs = 5 * 60 * 1000; // 5 minutes
      const estimatedRows =
        durationMs > 0 ? Math.ceil(durationMs / approxIntervalMs) : 0;
      // Clamp between 2000 (min for aggregates) and 4000 (previous global cap)
      rowCap = Math.min(4000, Math.max(2000, estimatedRows));
    }

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

      // Fetch DESC so we always keep the NEWEST readings for large ranges,
      // then reverse to chronological order for aggregation/charts.
      // Row cap is adaptive based on aggregation level.
      const rawReadings = await ctx.db
        .query("deviceReadings")
        .withIndex("by_deviceId_recordedAt", (q) =>
          q
            .eq("deviceId", devId)
            .gte("recordedAt", args.startTime)
            .lte("recordedAt", effectiveEndTime)
        )
        .order("desc")
        .take(rowCap);

      // Reverse to chronological order (oldest → newest)
      const readings = rawReadings.reverse();

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
    const finalReadings = agg === "raw" ? allReadings : aggregateReadings(allReadings, agg);

    // Compute summary
    const summary = computeSummary(finalReadings, args.startTime, effectiveEndTime);

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
 * Get current AC config from the latest reading for a device.
 * Used by setAcConfig/setPortState to include all required acOutCfg params.
 */
export const getLatestAcConfig = internalQuery({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_recordedAt", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .first();
    if (!latest) return null;
    return {
      acEnabled: latest.acEnabled ?? true,
      acXboost: latest.acXboost ?? false,
      acOutVoltage: latest.acOutVoltage ?? undefined,
      acOutFrequency: latest.acOutFrequency ?? undefined,
    };
  },
});

/**
 * Optimistically patch config fields on the latest reading for a device.
 * Called immediately after a SET command succeeds so the UI updates instantly
 * (the EcoFlow API takes several seconds to reflect changes).
 */
export const patchLatestReading = internalMutation({
  args: {
    deviceId: v.id("devices"),
    fields: v.object({
      acEnabled: v.optional(v.boolean()),
      dcOutEnabled: v.optional(v.boolean()),
      carChargerEnabled: v.optional(v.boolean()),
      acXboost: v.optional(v.boolean()),
      buzzerSilent: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_recordedAt", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .first();
    if (!latest) return;

    const patch: Record<string, boolean> = {};
    if (args.fields.acEnabled !== undefined) patch.acEnabled = args.fields.acEnabled;
    if (args.fields.dcOutEnabled !== undefined) patch.dcOutEnabled = args.fields.dcOutEnabled;
    if (args.fields.carChargerEnabled !== undefined) patch.carChargerEnabled = args.fields.carChargerEnabled;
    if (args.fields.acXboost !== undefined) patch.acXboost = args.fields.acXboost;
    if (args.fields.buzzerSilent !== undefined) patch.buzzerSilent = args.fields.buzzerSilent;

    await ctx.db.patch(latest._id, patch);
  },
});

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
    // Config state fields
    acEnabled: v.optional(v.boolean()),
    dcOutEnabled: v.optional(v.boolean()),
    carChargerEnabled: v.optional(v.boolean()),
    acXboost: v.optional(v.boolean()),
    acOutVoltage: v.optional(v.float64()),
    acOutFrequency: v.optional(v.float64()),
    acChargingWatts: v.optional(v.float64()),
    dcChargingCurrent: v.optional(v.float64()),
    acStandbyMins: v.optional(v.float64()),
    carStandbyMins: v.optional(v.float64()),
    unitStandbyMins: v.optional(v.float64()),
    maxChargeSoc: v.optional(v.float64()),
    minDischargeSoc: v.optional(v.float64()),
    solarPriority: v.optional(v.boolean()),
    energyMgmtEnabled: v.optional(v.boolean()),
    backupReserveSoc: v.optional(v.float64()),
    acAutoOutEnabled: v.optional(v.boolean()),
    minAcOutSoc: v.optional(v.float64()),
    smartGenOnSoc: v.optional(v.float64()),
    smartGenOffSoc: v.optional(v.float64()),
    lcdOffSeconds: v.optional(v.float64()),
    buzzerSilent: v.optional(v.boolean()),
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
      // Config state
      acEnabled: args.acEnabled,
      dcOutEnabled: args.dcOutEnabled,
      carChargerEnabled: args.carChargerEnabled,
      acXboost: args.acXboost,
      acOutVoltage: args.acOutVoltage,
      acOutFrequency: args.acOutFrequency,
      acChargingWatts: args.acChargingWatts,
      dcChargingCurrent: args.dcChargingCurrent,
      acStandbyMins: args.acStandbyMins,
      carStandbyMins: args.carStandbyMins,
      unitStandbyMins: args.unitStandbyMins,
      maxChargeSoc: args.maxChargeSoc,
      minDischargeSoc: args.minDischargeSoc,
      solarPriority: args.solarPriority,
      energyMgmtEnabled: args.energyMgmtEnabled,
      backupReserveSoc: args.backupReserveSoc,
      acAutoOutEnabled: args.acAutoOutEnabled,
      minAcOutSoc: args.minAcOutSoc,
      smartGenOnSoc: args.smartGenOnSoc,
      smartGenOffSoc: args.smartGenOffSoc,
      lcdOffSeconds: args.lcdOffSeconds,
      buzzerSilent: args.buzzerSilent,
    });
  },
});

/**
 * Get the recordedAt timestamp of the latest reading for a device.
 * Used by refreshReadings to check staleness before hitting the EcoFlow API.
 */
export const getLatestTimestamp = internalQuery({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_recordedAt", (q) => q.eq("deviceId", args.deviceId))
      .order("desc")
      .first();
    return latest?.recordedAt ?? null;
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
