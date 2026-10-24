import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { displayTelemetryValidator, mergeDisplayTelemetry } from "./displayTelemetry";
import { internal } from "./_generated/api";
import { isTemperatureCollectionEnabled } from "./temperatureCollection";

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

// ─── Display-only last reported telemetry ───────────────────────────────────

export const recordDisplayTelemetry = internalMutation({
  args: { deviceId: v.id("devices"), telemetry: displayTelemetryValidator },
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device || !device.isActive) throw new Error("Device unavailable");
    const incoming = isTemperatureCollectionEnabled() ? args.telemetry : { ...args.telemetry, temperature: undefined };
    const merged = mergeDisplayTelemetry(device.displayTelemetry, incoming);
    if (merged !== device.displayTelemetry && merged !== undefined) {
      await ctx.db.patch(args.deviceId, { displayTelemetry: merged });
    }
    return null;
  },
});

/** Append a newly received generic BMS temperature without manufacturing power data. */
export const recordTemperatureObservation = internalMutation({
  args: {
    deviceId: v.id("devices"),
    temperature: v.float64(),
    receivedAt: v.float64(),
    leaseToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Fence callbacks from temperature actions started before the pause release.
    if (!isTemperatureCollectionEnabled()) return null;
    const device = await ctx.db.get(args.deviceId);
    if (!device || !device.isActive) throw new Error("Device unavailable");
    const now = Date.now();
    const lease = device.mqttLeases?.temperature;
    if (!lease || lease.token !== args.leaseToken || !Number.isFinite(lease.expiresAt) || lease.expiresAt <= now) {
      return null;
    }
    if (!Number.isFinite(args.temperature) || !Number.isFinite(args.receivedAt) || args.receivedAt < 0) {
      throw new Error("Invalid temperature observation");
    }
    // This is the original packet receipt, within the current server-timed lease,
    // never a later refresh/cache fetch time or a prior session's observation.
    if (args.receivedAt > now + 5_000 || args.receivedAt < now - TEMPERATURE_LEASE_MS ||
      args.receivedAt < lease.expiresAt - TEMPERATURE_LEASE_MS) return null;
    const displayed = device.displayTelemetry?.temperature;
    if (displayed?.source === "mqtt" && Number.isFinite(displayed.receivedAt) && args.receivedAt <= displayed.receivedAt) {
      return null;
    }
    const duplicate = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_readingKind_recordedAt", (q) => q
        .eq("deviceId", args.deviceId).eq("readingKind", "temperature").eq("recordedAt", args.receivedAt))
      .first();
    if (duplicate) return null;
    const latest = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_readingKind_recordedAt", (q) => q
        .eq("deviceId", args.deviceId).eq("readingKind", "temperature"))
      .order("desc")
      .first();
    if (latest && latest.recordedAt >= args.receivedAt) return null;

    await ctx.db.insert("deviceReadings", {
      deviceId: args.deviceId,
      readingKind: "temperature",
      temperature: args.temperature,
      temperatureMeasurement: "bms-generic-mqtt-v1",
      recordedAt: args.receivedAt,
    });
    // A REST fetch timestamp cannot outrank this verified packet's receipt.
    // Newer/equal actual MQTT observations were rejected above.
    const displayTelemetry = {
      ...device.displayTelemetry,
      temperature: { value: args.temperature, source: "mqtt" as const, receivedAt: args.receivedAt },
    };
    await ctx.db.patch(args.deviceId, { displayTelemetry });
    return null;
  },
});

// ─── MQTT session singleflight ──────────────────────────────────────────────

const MQTT_LEASE_MS = 90_000;
const TEMPERATURE_LEASE_MS = 360_000;
const mqttSessionArgs = {
  deviceId: v.id("devices"),
  purpose: v.union(v.literal("diagnostic"), v.literal("collector"), v.literal("temperature")),
  token: v.string(),
};

/** Serialize each stable client ID; the server chooses the expiry time. */
export const claimMqttSession = internalMutation({
  args: mqttSessionArgs,
  handler: async (ctx, args) => {
    if (args.purpose === "temperature" && !isTemperatureCollectionEnabled()) return { allowed: false };
    const device = await ctx.db.get(args.deviceId);
    if (!device || !device.isActive) throw new Error("Device unavailable");
    const now = Date.now();
    const current = device.mqttLeases?.[args.purpose];
    if (current && current.expiresAt > now) return { allowed: false };
    const leaseMs = args.purpose === "temperature" ? TEMPERATURE_LEASE_MS : MQTT_LEASE_MS;
    await ctx.db.patch(args.deviceId, {
      mqttLeases: {
        ...device.mqttLeases,
        [args.purpose]: { token: args.token, expiresAt: now + leaseMs },
      },
    });
    if (args.purpose === "temperature") {
      // A crashed action must still clear reactive progress after its bounded lease.
      await ctx.scheduler.runAfter(leaseMs, internal.devices_internal.releaseMqttSession, args);
    }
    return { allowed: true };
  },
});

/** An expired caller must never release the replacement session's lease. */
export const releaseMqttSession = internalMutation({
  args: mqttSessionArgs,
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.mqttLeases?.[args.purpose]?.token !== args.token) return null;
    const leases = { ...device.mqttLeases };
    delete leases[args.purpose];
    await ctx.db.patch(args.deviceId, { mqttLeases: Object.keys(leases).length > 0 ? leases : undefined });
    return null;
  },
});
