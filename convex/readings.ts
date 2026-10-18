import { query, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { Doc, Id } from "./_generated/dataModel";
import { chargingTypeSourceValidator, inputMeasurementValidator, inputQualityValidator, type ChargingTypeSource, type InputMeasurement, type InputQuality } from "./readingQuality";
import { calculateHistoryEnergyTotals, getSolarPanelBucketSummary, historyResultValidator, type HistoryReading, type TemperatureHistoryReading } from "./historyAnalytics";
import { aggregateTemperatureObservations, combineTemperatureObservations } from "./temperatureHistory";

// deviceReadings can contain a legacy raw EcoFlow payload, so reading thousands
// of documents in one query can exceed Convex's transaction read limits before
// the documents are mapped to the much smaller client-facing history shape.
const MAX_HISTORY_DOCUMENTS = 500;

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
        .withIndex("by_deviceId_readingKind_recordedAt", (q) => q.eq("deviceId", device._id).eq("readingKind", undefined))
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
              solarInputWatts: reading.solarInputWatts ?? null,
              chargingType: reading.chargingType ?? null,
              chargingTypeSource: reading.chargingTypeSource ?? null,
              inputQuality: reading.inputQuality ?? null,
              inputMeasurement: reading.inputMeasurement ?? null,
              powerMeasurement: reading.powerMeasurement ?? null,
              solarPanelInputWatts: reading.solarPanelInputWatts ?? null,
              solarPanelReceivedAt: reading.solarPanelReceivedAt ?? null,
              solarPanelMeasurement: reading.solarPanelMeasurement ?? null,
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
              acChargingPaused: reading.acChargingPaused ?? null,
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
      .withIndex("by_deviceId_readingKind_recordedAt", (q) => q.eq("deviceId", args.deviceId).eq("readingKind", undefined))
      .order("desc")
      .first();

    return reading
      ? {
          batteryLevel: reading.batteryLevel ?? null,
          inputWatts: reading.inputWatts ?? null,
          acInputWatts: reading.acInputWatts ?? null,
          dcInputWatts: reading.dcInputWatts ?? null,
          solarInputWatts: reading.solarInputWatts ?? null,
          chargingType: reading.chargingType ?? null,
          chargingTypeSource: reading.chargingTypeSource ?? null,
          inputQuality: reading.inputQuality ?? null,
          inputMeasurement: reading.inputMeasurement ?? null,
          powerMeasurement: reading.powerMeasurement ?? null,
          solarPanelInputWatts: reading.solarPanelInputWatts ?? null,
          solarPanelReceivedAt: reading.solarPanelReceivedAt ?? null,
          solarPanelMeasurement: reading.solarPanelMeasurement ?? null,
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
          acChargingPaused: reading.acChargingPaused ?? null,
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
  returns: historyResultValidator,
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) {
      return emptyHistory();
    }

    // Cap endTime to now to prevent reactive re-execution when new readings
    // are inserted in the future. This is the #1 bandwidth optimization.
    const effectiveEndTime = Math.min(args.endTime, Date.now());

    // An inverted custom range produces contradictory index bounds. Treat it
    // as an empty range instead of allowing the database query to fail.
    if (args.startTime >= effectiveEndTime) {
      return emptyHistory();
    }

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
      if (!owned) {
        return emptyHistory();
      }
    }

    const collectionSettings = await ctx.db
      .query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    const collectionIntervalMinutes = Math.max(
      1,
      collectionSettings?.collectionIntervalMinutes ?? 5
    );

    const agg = args.aggregation ?? "raw";
    const sampleWindows = getHistorySampleWindows(
      args.startTime,
      effectiveEndTime,
      collectionIntervalMinutes
    );
    let samplingIntervalMs = getHistorySamplingIntervalMs(sampleWindows);
    const samplingIntervalsByDevice = new Map<string, number | null>();

    const allReadings: HistoryReading[] = [];
    const nativeTemperatures: TemperatureHistoryReading[] = [];
    let temperatureSamplingIntervalMs: number | null = null;

    // Build a map of deviceId -> device info
    const deviceMap = new Map(userDevices.map((d) => [d._id, d]));

    for (const devId of deviceIds) {
      const device = deviceMap.get(devId);
      if (!device) continue;

      // Configured cron cadence cannot bound actual density: manual refreshes
      // and post-command captures may add readings between scheduled captures.
      // Reserve half the document budget for a full-range fallback if needed.
      let deviceWindows = sampleWindows;
      let prefetched: Array<Doc<"deviceReadings">> = [];
      if (!deviceWindows) {
        const prefetchLimit = Math.floor(MAX_HISTORY_DOCUMENTS / 2);
        prefetched = await ctx.db
          .query("deviceReadings")
          .withIndex("by_deviceId_readingKind_recordedAt", (q) =>
            q.eq("deviceId", devId).eq("readingKind", undefined).gte("recordedAt", args.startTime).lte("recordedAt", effectiveEndTime)
          )
          .order("desc")
          .take(prefetchLimit);
        if (prefetched.length === prefetchLimit) {
          const earliest = await ctx.db
            .query("deviceReadings")
            .withIndex("by_deviceId_readingKind_recordedAt", (q) =>
              q.eq("deviceId", devId).eq("readingKind", undefined).gte("recordedAt", args.startTime).lte("recordedAt", effectiveEndTime)
            )
            .order("asc")
            .first();
          // Compare IDs as several captures can share the same timestamp.
          if (earliest && earliest._id !== prefetched[prefetched.length - 1]._id) {
            deviceWindows = createHistorySampleWindows(
              args.startTime, effectiveEndTime, MAX_HISTORY_DOCUMENTS - prefetchLimit - 1
            );
            samplingIntervalMs = Math.max(samplingIntervalMs ?? 0, getHistorySamplingIntervalMs(deviceWindows) ?? 0);
          }
        }
      }

      samplingIntervalsByDevice.set(devId, getHistorySamplingIntervalMs(deviceWindows));
      const windowsToRead = deviceWindows;
      const readings = windowsToRead
        ? (
            await Promise.all(
              windowsToRead.map((window, index) =>
                ctx.db
                  .query("deviceReadings")
                  .withIndex("by_deviceId_readingKind_recordedAt", (q) => {
                    const range = q
                      .eq("deviceId", devId)
                      .eq("readingKind", undefined)
                      .gte("recordedAt", window.startTime);
                    return index === windowsToRead.length - 1
                      ? range.lte("recordedAt", window.endTime)
                      : range.lt("recordedAt", window.endTime);
                  })
                  .order("desc")
                  .first()
              )
            )
          ).filter((reading) => reading !== null)
        : prefetched.reverse();

      for (const r of readings) {
        allReadings.push({
          deviceId: r.deviceId,
          deviceName: device.deviceName ?? "EcoFlow Device",
          deviceSn: device.deviceSn,
          batteryLevel: r.batteryLevel ?? null,
          inputWatts: r.inputWatts ?? null,
          acInputWatts: r.acInputWatts ?? null,
          dcInputWatts: r.dcInputWatts ?? null,
          solarInputWatts: r.solarInputWatts ?? null,
          chargingType: r.chargingType ?? null,
          chargingTypeSource: r.chargingTypeSource ?? null,
          inputQuality: r.inputQuality ?? null,
          inputMeasurement: r.inputMeasurement ?? null,
          powerMeasurement: r.powerMeasurement ?? null,
          solarPanelInputWatts: r.solarPanelInputWatts ?? null,
          solarPanelReceivedAt: r.solarPanelReceivedAt ?? null,
          solarPanelMeasurement: r.solarPanelMeasurement ?? null,
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

      // A separate bounded indexed stream prevents power sampling from losing
      // infrequent sensor reports. It never consumes the power read budget.
      const thermal = await readTemperatureHistory(ctx, devId, args.startTime, effectiveEndTime);
      if (thermal.samplingIntervalMs !== null) {
        temperatureSamplingIntervalMs = Math.max(temperatureSamplingIntervalMs ?? 0, thermal.samplingIntervalMs);
      }
      if (readings.some((reading) => typeof reading.temperature === "number" && Number.isFinite(reading.temperature))) {
        const legacySampling = samplingIntervalsByDevice.get(devId);
        if (legacySampling !== null && legacySampling !== undefined) {
          temperatureSamplingIntervalMs = Math.max(temperatureSamplingIntervalMs ?? 0, legacySampling);
        }
      }
      for (const reading of thermal.readings) {
        if (typeof reading.temperature !== "number" || !Number.isFinite(reading.temperature) ||
            reading.temperatureMeasurement !== "bms-generic-mqtt-v1") continue;
        nativeTemperatures.push({
          deviceId: devId, deviceName: device.deviceName ?? "EcoFlow Device", deviceSn: device.deviceSn,
          temperature: reading.temperature, recordedAt: reading.recordedAt,
          temperatureSampleCount: 1, temperatureMeasurement: reading.temperatureMeasurement,
        });
      }
    }

    // Energy uses the already-fetched bounded raw samples, independent of chart
    // buckets. Device grouping prevents an interval between unrelated stations.
    const energyTotals = calculateHistoryEnergyTotals(allReadings, samplingIntervalMs, {
      collectionIntervalMinutes, startTime: args.startTime, endTime: effectiveEndTime,
    }, samplingIntervalsByDevice);
    const sampledReadings = allReadings.length;

    // Existing aggregate helpers also accept rows without device metadata. Here
    // every contributor was mapped from an owned device, so retain that identity
    // and normalize optional source fields at this deliberate query boundary.
    const finalReadings = agg === "raw" ? allReadings : aggregateReadings(allReadings, agg).map((row) => ({
      ...row,
      deviceId: row.deviceId!, deviceName: row.deviceName!, deviceSn: row.deviceSn!,
      solarInputWatts: row.solarInputWatts ?? null,
      chargingTypeSource: row.chargingTypeSource ?? null,
      inputMeasurement: row.inputMeasurement ?? null,
      powerMeasurement: row.powerMeasurement ?? null,
      solarPanelInputWatts: row.solarPanelInputWatts ?? null,
      solarPanelReceivedAt: row.solarPanelReceivedAt ?? null,
      solarPanelMeasurement: row.solarPanelMeasurement ?? null,
    }));

    const observations = combineTemperatureObservations(allReadings, nativeTemperatures);
    const temperatureReadings = aggregateTemperatureObservations(observations, agg);
    const temperaturesByTime = new Map(temperatureReadings.map((reading) =>
      [`${reading.deviceId}:${reading.recordedAt}`, reading] as const));
    // Preserve the existing frontend's rows/count contract during a backend-first
    // release. Only an exact timestamp/bucket match may add thermal display data;
    // power fields, PV provenance and energy calculations above are untouched.
    const displayReadings = finalReadings.map((reading) => {
      const temperature = temperaturesByTime.get(`${reading.deviceId}:${reading.recordedAt}`);
      return temperature ? { ...reading, temperature: temperature.temperature,
        temperatureSampleCount: temperature.temperatureSampleCount } : reading;
    });
    // Average/max use observations before display averaging. The existing
    // summary keeps its displayed-count semantics and remains power-gated;
    // a separate thermal summary also works when no power reading exists.
    const summary = computeSummary(displayReadings, args.startTime, effectiveEndTime, observations);
    const temperatureSummary = observations.length > 0 ? {
      avgTemperature: Math.round(observations.reduce((sum, reading) => sum + reading.temperature, 0) / observations.length * 100) / 100,
      maxTemperature: observations.reduce((maximum, reading) => Math.max(maximum, reading.temperature), Number.NEGATIVE_INFINITY),
      temperatureReadings: observations.length,
    } : null;

    return { readings: displayReadings, summary, samplingIntervalMs, energyTotals, sampledReadings,
      temperatureReadings, temperatureSamplingIntervalMs, temperatureSampledReadings: observations.length, temperatureSummary };
  },
});

/** The thermal clock advances history windows without refreshing power health. */
export const latestTemperatureTimestamp = query({
  args: { deviceId: v.id("devices") },
  returns: v.union(v.float64(), v.null()),
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) return null;
    const reading = await ctx.db.query("deviceReadings")
      .withIndex("by_deviceId_readingKind_recordedAt", (q) =>
        q.eq("deviceId", args.deviceId).eq("readingKind", "temperature"))
      .order("desc").first();
    return reading?.temperatureMeasurement === "bms-generic-mqtt-v1" &&
      typeof reading.temperature === "number" && Number.isFinite(reading.temperature)
      ? reading.recordedAt : null;
  },
});

/**
 * Get all stored observation counts, including independent thermal events.
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
 * Used by setAcConfig/setPortState/setChargingConfig to include all required params.
 */
export const getLatestAcConfig = internalQuery({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_readingKind_recordedAt", (q) => q.eq("deviceId", args.deviceId).eq("readingKind", undefined))
      .order("desc")
      .first();
    if (!latest) return null;
    return {
      acEnabled: latest.acEnabled ?? true,
      acXboost: latest.acXboost ?? false,
      acOutVoltage: latest.acOutVoltage ?? undefined,
      acOutFrequency: latest.acOutFrequency ?? undefined,
      acChargingWatts: latest.acChargingWatts ?? undefined,
      acChargingPaused: latest.acChargingPaused ?? false,
    };
  },
});

/**
 * Get current energy management config from the latest reading.
 * Used by setEnergyManagement to include all required watthConfig/acAutoOutConfig params.
 */
export const getLatestEnergyConfig = internalQuery({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_readingKind_recordedAt", (q) => q.eq("deviceId", args.deviceId).eq("readingKind", undefined))
      .order("desc")
      .first();
    if (!latest) return null;
    return {
      energyMgmtEnabled: latest.energyMgmtEnabled ?? false,
      backupReserveSoc: latest.backupReserveSoc ?? undefined,
      maxChargeSoc: latest.maxChargeSoc ?? undefined,
      minDischargeSoc: latest.minDischargeSoc ?? undefined,
      acAutoOutEnabled: latest.acAutoOutEnabled ?? false,
      minAcOutSoc: latest.minAcOutSoc ?? undefined,
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
      acChargingWatts: v.optional(v.float64()),
      acChargingPaused: v.optional(v.boolean()),
      dcChargingCurrent: v.optional(v.float64()),
      maxChargeSoc: v.optional(v.float64()),
    }),
  },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_readingKind_recordedAt", (q) => q.eq("deviceId", args.deviceId).eq("readingKind", undefined))
      .order("desc")
      .first();
    if (!latest) return;

    const patch: Record<string, boolean | number> = {};
    if (args.fields.acEnabled !== undefined) patch.acEnabled = args.fields.acEnabled;
    if (args.fields.dcOutEnabled !== undefined) patch.dcOutEnabled = args.fields.dcOutEnabled;
    if (args.fields.carChargerEnabled !== undefined) patch.carChargerEnabled = args.fields.carChargerEnabled;
    if (args.fields.acXboost !== undefined) patch.acXboost = args.fields.acXboost;
    if (args.fields.buzzerSilent !== undefined) patch.buzzerSilent = args.fields.buzzerSilent;
    if (args.fields.acChargingWatts !== undefined) patch.acChargingWatts = args.fields.acChargingWatts;
    if (args.fields.acChargingPaused !== undefined) patch.acChargingPaused = args.fields.acChargingPaused;
    if (args.fields.dcChargingCurrent !== undefined) patch.dcChargingCurrent = args.fields.dcChargingCurrent;
    if (args.fields.maxChargeSoc !== undefined) patch.maxChargeSoc = args.fields.maxChargeSoc;

    await ctx.db.patch(latest._id, patch);
  },
});

/**
 * Insert a single reading — called from the ecoflow action after fetching quota.
 */
interface ReadingEvidence {
  inputWatts?: number;
  outputWatts?: number;
  recordedAt: number;
  powerMeasurement?: "pd-totals-mqtt-v1";
  solarPanelInputWatts?: number;
  solarPanelReceivedAt?: number;
  solarPanelMeasurement?: "delta2-mppt-mqtt-v1";
}

/** Keep independently measured panel watts separate from the station split. */
export function validateReadingEvidence(reading: ReadingEvidence): void {
  const finitePower = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;
  if (reading.powerMeasurement !== undefined &&
    (!finitePower(reading.inputWatts) || !finitePower(reading.outputWatts) || !finitePower(reading.recordedAt))) {
    throw new Error("Invalid live power measurement");
  }
  const hasPanelEvidence = reading.solarPanelInputWatts !== undefined ||
    reading.solarPanelReceivedAt !== undefined || reading.solarPanelMeasurement !== undefined;
  if (!hasPanelEvidence) return;
  if (reading.powerMeasurement !== "pd-totals-mqtt-v1" ||
    reading.solarPanelMeasurement !== "delta2-mppt-mqtt-v1" ||
    !finitePower(reading.solarPanelInputWatts) || !finitePower(reading.solarPanelReceivedAt) ||
    Math.abs(reading.solarPanelReceivedAt - reading.recordedAt) > 5_000) {
    throw new Error("Invalid PV panel measurement");
  }
}

export const insertReading = internalMutation({
  args: {
    deviceId: v.id("devices"),
    batteryLevel: v.optional(v.float64()),
    inputWatts: v.optional(v.float64()),
    acInputWatts: v.optional(v.float64()),
    dcInputWatts: v.optional(v.float64()),
    solarInputWatts: v.optional(v.float64()),
    chargingType: v.optional(v.float64()),
    chargingTypeSource: v.optional(chargingTypeSourceValidator),
    inputQuality: v.optional(inputQualityValidator),
    inputMeasurement: v.optional(inputMeasurementValidator),
    powerMeasurement: v.optional(v.literal("pd-totals-mqtt-v1")),
    solarPanelInputWatts: v.optional(v.float64()),
    solarPanelReceivedAt: v.optional(v.float64()),
    solarPanelMeasurement: v.optional(v.literal("delta2-mppt-mqtt-v1")),
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
    acChargingPaused: v.optional(v.boolean()),
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
    validateReadingEvidence(args);
    return await ctx.db.insert("deviceReadings", {
      deviceId: args.deviceId,
      batteryLevel: args.batteryLevel,
      inputWatts: args.inputWatts,
      acInputWatts: args.acInputWatts,
      dcInputWatts: args.dcInputWatts,
      solarInputWatts: args.solarInputWatts,
      chargingType: args.chargingType,
      chargingTypeSource: args.chargingTypeSource,
      inputQuality: args.inputQuality,
      inputMeasurement: args.inputMeasurement,
      powerMeasurement: args.powerMeasurement,
      solarPanelInputWatts: args.solarPanelInputWatts,
      solarPanelReceivedAt: args.solarPanelReceivedAt,
      solarPanelMeasurement: args.solarPanelMeasurement,
      outputWatts: args.outputWatts,
      acOutputWatts: args.acOutputWatts,
      dcOutputWatts: args.dcOutputWatts,
      usbOutputWatts: args.usbOutputWatts,
      remainingTime: args.remainingTime,
      temperature: args.temperature,
      status: args.status,
      recordedAt: args.recordedAt,
      // Config state
      acEnabled: args.acEnabled,
      dcOutEnabled: args.dcOutEnabled,
      carChargerEnabled: args.carChargerEnabled,
      acXboost: args.acXboost,
      acOutVoltage: args.acOutVoltage,
      acOutFrequency: args.acOutFrequency,
      acChargingWatts: args.acChargingWatts,
      acChargingPaused: args.acChargingPaused,
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
export const claimRefreshAttempt = internalMutation({
  args: { deviceId: v.id("devices"), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device || !device.isActive) throw new Error("Device unavailable");

    const now = Date.now();
    const cooldownMs = 2 * 60 * 1000;
    if (!args.force) {
      const latestReading = await ctx.db
        .query("deviceReadings")
        .withIndex("by_deviceId_readingKind_recordedAt", (q) => q.eq("deviceId", args.deviceId).eq("readingKind", undefined))
        .order("desc")
        .first();
      if (latestReading && now - latestReading.recordedAt < cooldownMs) {
        return { allowed: false, reason: "fresh" as const, retryAfterMs: cooldownMs - (now - latestReading.recordedAt) };
      }
    }
    if (device.lastRefreshAttemptAt !== undefined && now - device.lastRefreshAttemptAt < cooldownMs) {
      return { allowed: false, reason: "rate_limited" as const, retryAfterMs: cooldownMs - (now - device.lastRefreshAttemptAt) };
    }

    // The mutation serializes simultaneous manual/focus requests for this device.
    await ctx.db.patch(device._id, { lastRefreshAttemptAt: now });
    return { allowed: true, reason: "allowed" as const, retryAfterMs: 0 };
  },
});

export const recordCollectionStatus = internalMutation({
  args: {
    deviceId: v.id("devices"),
    status: v.union(v.literal("online"), v.literal("offline"), v.literal("error")),
    checkedAt: v.float64(),
  },
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device || (device.lastStatusCheckAt !== undefined && device.lastStatusCheckAt > args.checkedAt)) return;
    await ctx.db.patch(device._id, {
      connectionStatus: args.status,
      lastStatusCheckAt: args.checkedAt,
      ...(args.status === "online" ? { lastRefreshSucceededAt: Date.now() } : {}),
    });
  },
});

export const getLatestTimestamp = internalQuery({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const latest = await ctx.db
      .query("deviceReadings")
      .withIndex("by_deviceId_readingKind_recordedAt", (q) => q.eq("deviceId", args.deviceId).eq("readingKind", undefined))
      .order("desc")
      .first();
    return latest?.recordedAt ?? null;
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyHistory() {
  return { readings: [], summary: null, samplingIntervalMs: null, energyTotals: null, sampledReadings: 0,
    temperatureReadings: [], temperatureSamplingIntervalMs: null, temperatureSampledReadings: 0, temperatureSummary: null };
}

/** At most 500 compact sensor documents per device, independently of power. */
async function readTemperatureHistory(ctx: QueryCtx, deviceId: Id<"devices">, startTime: number, endTime: number) {
  // The observed thermal cadence is slower than power, but density is measured
  // independently: this estimate never assumes manual or future reports are sparse.
  let windows = getHistorySampleWindows(startTime, endTime, 5);
  let prefetched: Array<Doc<"deviceReadings">> = [];
  if (!windows) {
    const prefetchLimit = Math.floor(MAX_HISTORY_DOCUMENTS / 2);
    prefetched = await ctx.db.query("deviceReadings")
      .withIndex("by_deviceId_readingKind_recordedAt", (q) =>
        q.eq("deviceId", deviceId).eq("readingKind", "temperature")
          .gte("recordedAt", startTime).lte("recordedAt", endTime))
      .order("desc").take(prefetchLimit);
    if (prefetched.length === prefetchLimit) {
      const earliest = await ctx.db.query("deviceReadings")
        .withIndex("by_deviceId_readingKind_recordedAt", (q) =>
          q.eq("deviceId", deviceId).eq("readingKind", "temperature")
            .gte("recordedAt", startTime).lte("recordedAt", endTime))
        .order("asc").first();
      if (earliest && earliest._id !== prefetched[prefetched.length - 1]._id) {
        windows = createHistorySampleWindows(startTime, endTime, MAX_HISTORY_DOCUMENTS - prefetchLimit - 1);
      }
    }
  }
  const samplingIntervalMs = getHistorySamplingIntervalMs(windows);
  const windowsToRead = windows;
  const readings = windowsToRead ? (await Promise.all(windowsToRead.map((window, index) =>
    ctx.db.query("deviceReadings")
      .withIndex("by_deviceId_readingKind_recordedAt", (q) => {
        const range = q.eq("deviceId", deviceId).eq("readingKind", "temperature").gte("recordedAt", window.startTime);
        return index === windowsToRead.length - 1
          ? range.lte("recordedAt", window.endTime) : range.lt("recordedAt", window.endTime);
      }).order("desc").first()
  ))).filter((reading) => reading !== null) : prefetched.reverse();
  return { readings, samplingIntervalMs };
}

export function getHistoryRowCap(
  startTime: number,
  endTime: number,
  collectionIntervalMinutes: number
): number {
  const durationMs = endTime - startTime;
  if (durationMs <= 0) return 0;

  const expectedIntervalMs = Math.max(1, collectionIntervalMinutes) * 60 * 1000;
  const estimatedRows = Math.ceil(durationMs / expectedIntervalMs);

  return Math.min(MAX_HISTORY_DOCUMENTS, Math.max(1, estimatedRows));
}

export function getHistorySampleWindows(
  startTime: number,
  endTime: number,
  collectionIntervalMinutes: number
): Array<{ startTime: number; endTime: number }> | null {
  const durationMs = endTime - startTime;
  if (durationMs <= 0) return null;

  const expectedIntervalMs = Math.max(1, collectionIntervalMinutes) * 60 * 1000;
  const estimatedRows = Math.ceil(durationMs / expectedIntervalMs);
  if (estimatedRows <= MAX_HISTORY_DOCUMENTS) return null;

  return createHistorySampleWindows(startTime, endTime, MAX_HISTORY_DOCUMENTS);
}

function createHistorySampleWindows(startTime: number, endTime: number, count: number) {
  const windowMs = (endTime - startTime) / count;
  return Array.from({ length: count }, (_, index) => ({
    startTime: startTime + index * windowMs,
    endTime:
      index === count - 1
        ? endTime
        : startTime + (index + 1) * windowMs,
  }));
}

export function getHistorySamplingIntervalMs(
  sampleWindows: Array<{ startTime: number; endTime: number }> | null
): number | null {
  if (!sampleWindows || sampleWindows.length === 0) return null;

  const firstStart = sampleWindows[0].startTime;
  const lastEnd = sampleWindows[sampleWindows.length - 1].endTime;
  return (lastEnd - firstStart) / sampleWindows.length;
}

interface ReadingRow {
  deviceId?: Id<"devices">;
  deviceName?: string;
  deviceSn?: string;
  batteryLevel: number | null;
  inputWatts: number | null;
  acInputWatts: number | null;
  dcInputWatts: number | null;
  solarInputWatts?: number | null;
  chargingType: number | null;
  chargingTypeSource?: ChargingTypeSource | null;
  inputQuality: InputQuality | null;
  inputMeasurement?: InputMeasurement | null;
  powerMeasurement?: "pd-totals-mqtt-v1" | null;
  solarPanelInputWatts?: number | null;
  solarPanelReceivedAt?: number | null;
  solarPanelMeasurement?: "delta2-mppt-mqtt-v1" | null;
  solarPanelAverageWatts?: number | null;
  solarPanelSampleCount?: number;
  sampleCount?: number;
  outputWatts: number | null;
  acOutputWatts: number | null;
  dcOutputWatts: number | null;
  usbOutputWatts: number | null;
  remainingTime: number | null;
  temperature: number | null;
  temperatureSampleCount?: number;
  status: string;
  recordedAt: number;
  [key: string]: unknown;
}

export function aggregateReadings(readings: ReadingRow[], bucket: string): ReadingRow[] {
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

  const buckets = new Map<string, ReadingRow[]>();

  for (const r of readings) {
    const key = `${r.deviceId ?? ""}:${Math.floor(r.recordedAt / bucketMs) * bucketMs}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const result: ReadingRow[] = [];
  for (const items of buckets.values()) {
    const bucketStart = Math.floor(items[0].recordedAt / bucketMs) * bucketMs;
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
      solarInputWatts: items.every((item) => typeof item.solarInputWatts === "number" && Number.isFinite(item.solarInputWatts))
        ? avg("solarInputWatts")
        : null,
      chargingType: items.every((item) => item.chargingType === items[0].chargingType)
        ? items[0].chargingType
        : null,
      chargingTypeSource: items.every((item) => item.chargingTypeSource === items[0].chargingTypeSource)
        ? items[0].chargingTypeSource
        : undefined,
      inputQuality: items.every((item) => item.inputQuality === "consistent")
        ? "consistent"
        : items.some((item) => item.inputQuality === "inconsistent")
          ? "inconsistent"
          : items.some((item) => item.inputQuality === "incomplete")
            ? "incomplete"
            : null,
      inputMeasurement: items.every((item) => (item.inputMeasurement ?? null) === (items[0].inputMeasurement ?? null))
        ? items[0].inputMeasurement ?? null
        : null,
      powerMeasurement: items.every((item) => item.powerMeasurement === "pd-totals-mqtt-v1")
        ? "pd-totals-mqtt-v1"
        : null,
      solarPanelInputWatts: items.every((item) => item.solarPanelMeasurement === "delta2-mppt-mqtt-v1" &&
        typeof item.solarPanelInputWatts === "number" && Number.isFinite(item.solarPanelInputWatts))
        ? avg("solarPanelInputWatts")
        : null,
      // An averaged bucket has no single sensor receipt timestamp.
      solarPanelReceivedAt: null,
      solarPanelMeasurement: items.every((item) => item.solarPanelMeasurement === "delta2-mppt-mqtt-v1" &&
        typeof item.solarPanelInputWatts === "number" && Number.isFinite(item.solarPanelInputWatts))
        ? "delta2-mppt-mqtt-v1"
        : null,
      ...getSolarPanelBucketSummary(items),
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

export function computeSummary(
  readings: ReadingRow[], startTime: number, endTime: number,
  temperatureObservations?: readonly { temperature: number | null }[],
) {
  // Legacy clients use this object to display power cards. A thermal-only
  // range must not manufacture zero battery/power/energy through that gate.
  if (readings.length === 0) return null;

  const batteryLevels = readings
    .map((r) => r.batteryLevel)
    .filter((v): v is number => v !== null);
  const outputValues = readings
    .map((r) => r.outputWatts)
    .filter((v): v is number => v !== null);
  const tempValues = (temperatureObservations ?? readings)
    .map((r) => r.temperature)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

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
        : null,
    // Compatibility: this count describes the displayed power rows/buckets.
    // The independent stream's raw observation count is returned separately.
    temperatureReadings: readings.filter((reading) =>
      typeof reading.temperature === "number" && Number.isFinite(reading.temperature)).length,
    peakPowerOutput: outputValues.length > 0 ? Math.max(...outputValues) : 0,
    lowestBatteryLevel: batteryLevels.length > 0 ? Math.min(...batteryLevels) : 0,
    highestTemperature: tempValues.length > 0 ? Math.max(...tempValues) : null,
    startTime,
    endTime,
  };
}
