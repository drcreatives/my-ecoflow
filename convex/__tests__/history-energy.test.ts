import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Infer } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { auth } from "../auth";
import { history, latest, latestForDevice, latestTemperatureTimestamp, getLatestAcConfig, getLatestEnergyConfig, getLatestTimestamp, patchLatestReading, claimRefreshAttempt } from "../readings";
import { calculateHistoryEnergyTotals, historyResultValidator } from "../historyAnalytics";
import { getTrustedInputChannels } from "../../src/lib/reading-status";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const START = Date.UTC(2026, 9, 18, 10);
const MINUTE = 60_000;
const END = START + 60 * MINUTE;
const owner = "test-owner" as Id<"users">;
const deviceId = "test-device-a" as Id<"devices">;
const otherDeviceId = "test-device-b" as Id<"devices">;

const runHistory = (history as unknown as {
  _handler: (ctx: QueryCtx, args: {
    deviceId?: Id<"devices">; startTime: number; endTime: number; aggregation?: string;
  }) => Promise<Infer<typeof historyResultValidator>>;
})._handler;

function row(index: number, minute: number, overrides: Partial<Doc<"deviceReadings">> = {}): Doc<"deviceReadings"> {
  return {
    _id: `test-reading-${index}` as Id<"deviceReadings">,
    _creationTime: index,
    deviceId,
    recordedAt: START + minute * MINUTE,
    batteryLevel: 70,
    inputWatts: 221,
    outputWatts: 100,
    inputQuality: "incomplete",
    powerMeasurement: "pd-totals-mqtt-v1",
    solarPanelInputWatts: 200,
    solarPanelReceivedAt: START + minute * MINUTE,
    solarPanelMeasurement: "delta2-mppt-mqtt-v1",
    ...overrides,
  };
}

function context(stored: Doc<"deviceReadings">[], deviceIds = [deviceId], collectionIntervalMinutes = 5) {
  let documentsRead = 0;
  const readSizes: number[] = [];
  const indexes: string[] = [];
  const devices = deviceIds.map((id) => ({ _id: id, userId: owner, isActive: true, deviceName: `Station ${id}`, deviceSn: "TEST-DEVICE" }));
  const write = vi.fn(() => { throw new Error("History must not write"); });
  const read = (rows: Doc<"deviceReadings">[]) => {
    documentsRead += rows.length;
    readSizes.push(rows.length);
    return rows;
  };
  const query = vi.fn((table: string) => {
    if (table === "devices") return {
      withIndex: (index: string) => {
        indexes.push(`${table}.${index}`);
        return { collect: async () => devices };
      },
    };
    if (table === "dataRetentionSettings") return {
      withIndex: (index: string) => {
        indexes.push(`${table}.${index}`);
        return { first: async () => ({ collectionIntervalMinutes }) };
      },
    };
    if (table !== "deviceReadings") throw new Error("Unexpected table");
    let direction: "asc" | "desc" = "asc";
    const filters: Array<(reading: Doc<"deviceReadings">) => boolean> = [];
    const range = {
      eq: (field: keyof Doc<"deviceReadings">, value: unknown) => { filters.push((reading) => reading[field] === value); return range; },
      gte: (_field: "recordedAt", at: number) => { filters.push((reading) => reading.recordedAt >= at); return range; },
      lte: (_field: "recordedAt", at: number) => { filters.push((reading) => reading.recordedAt <= at); return range; },
      lt: (_field: "recordedAt", at: number) => { filters.push((reading) => reading.recordedAt < at); return range; },
    };
    const selected = () => stored.filter((reading) => filters.every((filter) => filter(reading)))
      .sort((left, right) => (direction === "asc" ? 1 : -1) *
        (left.recordedAt - right.recordedAt || left._creationTime - right._creationTime));
    const builder = {
      withIndex: (index: string, configure: (q: typeof range) => unknown) => {
        indexes.push(`${table}.${index}`);
        configure(range);
        return builder;
      },
      order: (order: "asc" | "desc") => { direction = order; return builder; },
      take: async (limit: number) => read(selected().slice(0, limit)),
      first: async () => read(selected().slice(0, 1))[0] ?? null,
    };
    return builder;
  });
  return {
    ctx: { db: { query, get: vi.fn(async (id: Id<"devices">) => devices.find(device => device._id === id) ?? null), insert: write, patch: write, delete: write } } as unknown as QueryCtx,
    query, write, indexes, readSizes,
    get documentsRead() { return documentsRead; },
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(END);
  vi.mocked(auth.getUserId).mockResolvedValue(owner);
});

function thermal(index: number, minute: number, temperature: number): Doc<"deviceReadings"> {
  return {
    _id: `thermal-${index}` as Id<"deviceReadings">, _creationTime: index,
    deviceId, readingKind: "temperature", temperature, recordedAt: START + minute * MINUTE,
    temperatureMeasurement: "bms-generic-mqtt-v1",
  };
}

async function invoke(registered: unknown, ctx: QueryCtx | MutationCtx, args: unknown): Promise<unknown> {
  return (registered as { _handler: (ctx: QueryCtx | MutationCtx, args: unknown) => Promise<unknown> })._handler(ctx, args);
}

describe("independent temperature history", () => {
  it("keeps legacy power summary absent for one real thermal observation while exposing its own summary", async () => {
    const memory = context([thermal(0, 5, 41)]);
    const result = await runHistory(memory.ctx, { deviceId, startTime: START, endTime: END });
    expect(result.readings).toEqual([]);
    expect(result.summary).toBeNull();
    expect(result.sampledReadings).toBe(0);
    expect(result.temperatureReadings).toHaveLength(1);
    expect(result.temperatureSampledReadings).toBe(1);
    expect(result.temperatureSummary).toEqual({ avgTemperature: 41, maxTemperature: 41, temperatureReadings: 1 });
    expect(memory.write).not.toHaveBeenCalled();
  });

  it("keeps actual thermal observations when every power row omits temperature, with unchanged AC and PV energy", async () => {
    const confirmed = { inputQuality: "consistent" as const, inputMeasurement: "delta2-pd-mqtt-v1" as const,
      inputWatts: 100, acInputWatts: 100, dcInputWatts: 0, solarInputWatts: 0 };
    const power = [row(0, 0, confirmed), row(1, 5, confirmed), row(2, 10, confirmed)];
    const stored = [...power, thermal(3, 2, 41), thermal(4, 7, 43), thermal(5, 8, 0)];
    const before = JSON.stringify(stored);
    const args = { deviceId, startTime: START, endTime: END };
    const baseline = await runHistory(context(power).ctx, args);
    expect(baseline.temperatureSummary).toBeNull();
    const raw = await runHistory(context(stored).ctx, args);
    const hourly = await runHistory(context(stored).ctx, { ...args, aggregation: "1h" });
    const daily = await runHistory(context(stored).ctx, { ...args, aggregation: "1d" });
    expect(raw.readings).toEqual(baseline.readings);
    expect(raw.readings.every(reading => reading.temperature === null)).toBe(true);
    expect(raw.energyTotals).toEqual(baseline.energyTotals);
    expect(hourly.energyTotals).toEqual(baseline.energyTotals);
    expect(daily.energyTotals).toEqual(baseline.energyTotals);
    expect(raw.temperatureReadings.map(reading => reading.temperature)).toEqual([41, 43, 0]);
    expect(raw.temperatureReadings[0]).toMatchObject({ recordedAt: START + 2 * MINUTE,
      temperatureSampleCount: 1, temperatureMeasurement: "bms-generic-mqtt-v1" });
    expect(hourly.temperatureReadings).toHaveLength(1);
    expect(hourly.temperatureReadings[0]).toMatchObject({ temperature: 28, recordedAt: START,
      temperatureSampleCount: 3, temperatureMeasurement: null });
    expect(raw.summary).toMatchObject({ temperatureReadings: 0, avgTemperature: 28, highestTemperature: 43, totalReadings: 3 });
    expect(hourly.summary).toMatchObject({ temperatureReadings: 1, avgTemperature: 28, highestTemperature: 43, totalReadings: 1 });
    expect(hourly.readings[0]).toMatchObject({ temperature: 28, temperatureSampleCount: 3 });
    expect(hourly.temperatureSampledReadings).toBe(3);
    expect(raw.temperatureSummary).toEqual({ avgTemperature: 28, maxTemperature: 43, temperatureReadings: 3 });
    expect(hourly.temperatureSummary).toEqual(raw.temperatureSummary);
    expect(daily.temperatureSummary).toEqual(raw.temperatureSummary);
    expect(raw.temperatureSampledReadings).toBe(3);
    expect(raw.temperatureSamplingIntervalMs).toBeNull();
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("deduplicates an exact legacy sensor timestamp in favor of native provenance and keeps all device buckets independent", async () => {
    const stored = [row(0, 2, { temperature: 39 }), thermal(1, 2, 41),
      { ...thermal(2, 3, 45), deviceId: otherDeviceId }];
    const raw = await runHistory(context(stored, [deviceId, otherDeviceId]).ctx, { startTime: START, endTime: END });
    const hourly = await runHistory(context(stored, [deviceId, otherDeviceId]).ctx, { startTime: START, endTime: END, aggregation: "1h" });
    expect(raw.temperatureReadings).toHaveLength(2);
    expect(raw.temperatureReadings[0]).toMatchObject({ temperature: 41, temperatureMeasurement: "bms-generic-mqtt-v1" });
    expect(hourly.temperatureReadings.map(reading => reading.temperature)).toEqual([41, 45]);
    expect(hourly.summary).toMatchObject({ avgTemperature: 43, highestTemperature: 45, temperatureReadings: 1 });
    expect(hourly.temperatureSampledReadings).toBe(2);
  });

  it("overlays only exact raw timestamps or matching device buckets, without carrying observations into other rows", async () => {
    const endTime = END + 60 * MINUTE;
    vi.mocked(Date.now).mockReturnValue(endTime);
    const power = [row(0, 0), row(1, 5), row(2, 0, { deviceId: otherDeviceId })];
    const stored = [...power, thermal(3, 2, 41), thermal(4, 5, 43), thermal(5, 61, 50)];
    const args = { startTime: START, endTime };
    const devices = [deviceId, otherDeviceId];
    const raw = await runHistory(context(stored, devices).ctx, args);
    const hourly = await runHistory(context(stored, devices).ctx, { ...args, aggregation: "1h" });
    const baseline = await runHistory(context(power, devices).ctx, { ...args, aggregation: "1h" });

    expect(raw.readings.map(reading => reading.temperature)).toEqual([null, 43, null]);
    expect(raw.readings[1]).toMatchObject({ temperatureSampleCount: 1, recordedAt: START + 5 * MINUTE });
    expect(hourly.readings).toHaveLength(2);
    expect(hourly.readings.find(reading => reading.deviceId === deviceId))
      .toMatchObject({ temperature: 42, temperatureSampleCount: 2, recordedAt: START });
    expect(hourly.readings.find(reading => reading.deviceId === otherDeviceId)?.temperature).toBeNull();
    expect(hourly.temperatureReadings).toHaveLength(2);
    expect(hourly.temperatureReadings[1]).toMatchObject({ temperature: 50, recordedAt: END });
    expect(hourly.summary).toMatchObject({ totalReadings: 2, temperatureReadings: 1, highestTemperature: 50 });
    expect(hourly.temperatureSampledReadings).toBe(3);
    expect(hourly.energyTotals).toEqual(baseline.energyTotals);
    const powerFields = (readings: typeof hourly.readings) => readings.map(({ temperature, temperatureSampleCount, ...powerReading }) => {
      void temperature;
      void temperatureSampleCount;
      return powerReading;
    });
    expect(powerFields(hourly.readings)).toEqual(powerFields(baseline.readings));
    for (const result of [raw, hourly]) {
      expect(result.summary!.temperatureReadings).toBeLessThanOrEqual(result.summary!.totalReadings);
    }
    expect(stored.filter(reading => reading.readingKind !== "temperature").every(reading => reading.temperature === undefined)).toBe(true);
  });

  it("does not weight bucket averages equally instead of actual observations", async () => {
    const endTime = END + 60 * MINUTE;
    vi.mocked(Date.now).mockReturnValue(endTime);
    const stored = [thermal(0, 1, 10), thermal(1, 2, 20), thermal(2, 3, 30), thermal(3, 61, 80)];
    const result = await runHistory(context(stored).ctx, { deviceId, startTime: START, endTime, aggregation: "1h" });
    expect(result.readings).toEqual([]);
    expect(result.temperatureReadings.map(reading => reading.temperature)).toEqual([20, 80]);
    expect(result.summary).toBeNull();
    expect(result.temperatureSummary).toEqual({ avgTemperature: 35, maxTemperature: 80, temperatureReadings: 4 });
    expect(result.temperatureSampledReadings).toBe(4);
    expect(result.energyTotals).toMatchObject({ acInput: 0, consumed: 0, solarPanelInput: 0, sourceIntervals: 0 });
  });

  it("keeps the thermal read budget independent when both streams overflow and reports each sampling interval", async () => {
    const power = Array.from({ length: 1_000 }, (_, index) => row(index, index * 60 / 1_000));
    const temperature = Array.from({ length: 1_000 }, (_, index) => thermal(index + 1_000, index * 60 / 1_000, 41));
    const memory = context([...power, ...temperature], [deviceId], 15);
    const result = await runHistory(memory.ctx, { deviceId, startTime: START, endTime: END });
    expect(result.sampledReadings).toBe(249);
    expect(result.temperatureSampledReadings).toBe(249);
    expect(result.samplingIntervalMs).toBe((END - START) / 249);
    expect(result.temperatureSamplingIntervalMs).toBe((END - START) / 249);
    expect(memory.documentsRead).toBe(1_000);
    expect(result.temperatureReadings.at(-1)?.recordedAt).toBeGreaterThan(END - MINUTE);
    expect(memory.write).not.toHaveBeenCalled();
  });

  it("keeps power sampling stable when only the thermal stream is dense", async () => {
    const power = [row(0, 0), row(1, 5)];
    const temperature = Array.from({ length: 1_000 }, (_, index) => thermal(index + 10, index * 60 / 1_000, 41));
    const memory = context([...power, ...temperature]);
    const result = await runHistory(memory.ctx, { deviceId, startTime: START, endTime: END });
    expect(result.sampledReadings).toBe(2);
    expect(result.samplingIntervalMs).toBeNull();
    expect(result.temperatureSamplingIntervalMs).not.toBeNull();
    expect(memory.documentsRead).toBe(502);
    expect(result.energyTotals).toEqual((await runHistory(context(power).ctx, { deviceId, startTime: START, endTime: END })).energyTotals);
  });

  it("excludes malformed or unproven native thermal rows while preserving real zero", async () => {
    const stored = [thermal(0, 1, 0), thermal(1, 2, Number.NaN),
      { ...thermal(2, 3, 40), temperatureMeasurement: undefined }];
    const result = await runHistory(context(stored).ctx, { deviceId, startTime: START, endTime: END });
    expect(result.temperatureReadings.map(reading => reading.temperature)).toEqual([0]);
    expect(result.summary).toBeNull();
    expect(result.temperatureSummary).toEqual({ avgTemperature: 0, maxTemperature: 0, temperatureReadings: 1 });
    expect(result.temperatureSampledReadings).toBe(1);
  });

  it("keeps latest power, configuration, optimistic patches and refresh freshness independent from a newer temperature event", async () => {
    const power = row(0, 0, { acEnabled: false, acChargingWatts: 350, maxChargeSoc: 85, backupReserveSoc: 30 });
    const temperature = thermal(1, 59, 41);
    const memory = context([power, temperature]);
    const patch = vi.fn(async () => undefined);
    const ctx = { ...memory.ctx, db: { ...memory.ctx.db, patch } } as unknown as MutationCtx;
    expect(await invoke(latest, ctx, {})).toMatchObject([{ reading: { recordedAt: START, outputWatts: 100 } }]);
    expect(await invoke(latestForDevice, ctx, { deviceId })).toMatchObject({ recordedAt: START, inputWatts: 221 });
    expect(await invoke(getLatestAcConfig, ctx, { deviceId })).toMatchObject({ acEnabled: false, acChargingWatts: 350 });
    expect(await invoke(getLatestEnergyConfig, ctx, { deviceId })).toMatchObject({ maxChargeSoc: 85, backupReserveSoc: 30 });
    expect(await invoke(getLatestTimestamp, ctx, { deviceId })).toBe(START);
    expect(await invoke(latestTemperatureTimestamp, ctx, { deviceId })).toBe(START + 59 * MINUTE);
    await invoke(patchLatestReading, ctx, { deviceId, fields: { acEnabled: true } });
    expect(patch).toHaveBeenCalledWith(power._id, { acEnabled: true });
    expect(await invoke(claimRefreshAttempt, ctx, { deviceId })).toMatchObject({ allowed: true });
    expect(temperature).not.toHaveProperty("acEnabled");
  });

  it.each(["unauthenticated", "foreign"])("guards the thermal window timestamp for %s requests", async condition => {
    const memory = context([thermal(0, 10, 41)]);
    if (condition === "unauthenticated") vi.mocked(auth.getUserId).mockResolvedValue(null);
    expect(await invoke(latestTemperatureTimestamp, memory.ctx, {
      deviceId: condition === "foreign" ? "foreign-device" as Id<"devices"> : deviceId,
    })).toBeNull();
    expect(memory.documentsRead).toBe(0);
    expect(memory.query).not.toHaveBeenCalled();
  });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("history raw-sample energy", () => {
  it("retains verified all-live hourly source averages and rejects a mixed live/cache bucket", async () => {
    const source = { inputQuality: "consistent" as const, inputMeasurement: "delta2-pd-mqtt-v1" as const,
      inputWatts: 100, acInputWatts: 100, dcInputWatts: 0, solarInputWatts: 0 };
    const live = [row(0, 0, source), row(1, 5, source)];
    const args = { deviceId, startTime: START, endTime: END, aggregation: "1h" };
    const verified = await runHistory(context(live).ctx, args);
    expect(verified.readings[0].inputMeasurement).toBe("delta2-pd-mqtt-v1");
    expect(getTrustedInputChannels(verified.readings[0])).toEqual({ acInputWatts: 100, dcInputWatts: 0 });
    expect(verified.energyTotals?.acInput).toBeCloseTo(100 * (5 / 60) / 1000);

    const mixed = await runHistory(context([live[0], { ...live[1], inputMeasurement: "delta2-pd-v1" }]).ctx, args);
    expect(mixed.readings[0].inputMeasurement).toBeNull();
    expect(getTrustedInputChannels(mixed.readings[0])).toBeNull();
    expect(mixed.energyTotals).toMatchObject({ acInput: 0, dcInput: 0, solarInput: 0, sourceIntervals: 0 });
    expect(mixed.energyTotals?.unattributedInput).toBeCloseTo(100 * (5 / 60) / 1000);
  });

  it.each([undefined, "legacy-modules", "delta2-pd-v1"] as const)(
    "keeps coherent historical source snapshots unclassified without live proof (%s)", async inputMeasurement => {
      const stored = [0, 5, 10].map((minute, index) => row(index, minute, {
        inputQuality: "consistent", inputMeasurement,
        inputWatts: 100, acInputWatts: 0, dcInputWatts: 100,
        solarInputWatts: 100, chargingType: 2,
      }));
      const before = JSON.stringify(stored);
      const memory = context(stored);
      const args = { deviceId, startTime: START, endTime: END };
      const raw = await runHistory(memory.ctx, args);
      const hourly = await runHistory(context(stored).ctx, { ...args, aggregation: "1h" });
      expect(raw.energyTotals).toMatchObject({
        sourceIntervals: 0, sourceCoveredMs: 0, solarIntervals: 0, solarCoveredMs: 0,
        acInput: 0, dcInput: 0, solarInput: 0,
      });
      expect(raw.energyTotals?.totalInput).toBeCloseTo(100 * (10 / 60) / 1000);
      expect(raw.energyTotals?.unattributedInput).toBeCloseTo(raw.energyTotals!.totalInput);
      expect(raw.energyTotals?.solarPanelInput).toBeCloseTo(200 * (10 / 60) / 1000);
      expect(hourly.energyTotals).toEqual(raw.energyTotals);
      expect(raw.readings[0]).toMatchObject({ inputWatts: 100, dcInputWatts: 100, solarInputWatts: 100,
        inputMeasurement: inputMeasurement ?? null });
      expect(JSON.stringify(stored)).toBe(before);
      expect(memory.write).not.toHaveBeenCalled();
    },
  );

  it("breaks source attribution at a cached endpoint while retaining total and independent panel integration", async () => {
    const liveSource = {
      inputQuality: "consistent" as const, inputMeasurement: "delta2-pd-mqtt-v1" as const,
      inputWatts: 100, acInputWatts: 100, dcInputWatts: 0, solarInputWatts: 0,
    };
    const stored = [row(0, 0, liveSource), row(1, 5, { ...liveSource, inputMeasurement: "delta2-pd-v1" }),
      row(2, 10, liveSource), row(3, 15, liveSource)];
    const result = await runHistory(context(stored).ctx, { deviceId, startTime: START, endTime: END, aggregation: "1h" });
    expect(result.energyTotals).toMatchObject({ sourceIntervals: 1, sourceCoveredMs: 5 * MINUTE,
      solarIntervals: 1, solarCoveredMs: 5 * MINUTE, dcInput: 0, solarInput: 0 });
    expect(result.energyTotals?.acInput).toBeCloseTo(100 * (5 / 60) / 1000);
    expect(result.energyTotals?.unattributedInput).toBeCloseTo(100 * (10 / 60) / 1000);
    expect(result.energyTotals?.totalInput).toBeCloseTo(100 * (15 / 60) / 1000);
    expect(result.energyTotals?.solarPanelInput).toBeCloseTo(200 * (15 / 60) / 1000);
  });

  it("keeps positive verified PV energy inside one hourly bucket without assigning missing station AC", async () => {
    const stored = [row(0, 0), row(1, 5, { solarPanelInputWatts: 300 }), row(2, 10, { solarPanelInputWatts: 400 })];
    const before = JSON.stringify(stored);
    const memory = context(stored);
    const result = await runHistory(memory.ctx, { deviceId, startTime: START, endTime: END, aggregation: "1h" });
    expect(result.readings).toHaveLength(1);
    expect(result.sampledReadings).toBe(3);
    expect(result.energyTotals?.solarPanelInput).toBeCloseTo(0.05);
    expect(result.energyTotals).toMatchObject({
      solarPanelIntervals: 2, solarPanelCoveredMs: 10 * MINUTE,
      sourceIntervals: 0, solarIntervals: 0, sourceCoveredMs: 0, solarCoveredMs: 0,
      acInput: 0, dcInput: 0, solarInput: 0,
    });
    expect(result.readings[0]).toMatchObject({ acInputWatts: null, dcInputWatts: null, solarInputWatts: null });
    expect(memory.documentsRead).toBe(3);
    expect(memory.query.mock.calls.map(([table]) => table)).toEqual(["devices", "dataRetentionSettings", "deviceReadings", "deviceReadings"]);
    expect(memory.write).not.toHaveBeenCalled();
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("returns the same complete energy totals for raw, hourly, and daily display aggregation", async () => {
    const stored = [row(0, 0), row(1, 5), row(2, 10)];
    const results = await Promise.all(["raw", "1h", "1d"].map(aggregation =>
      runHistory(context(stored).ctx, { deviceId, startTime: START, endTime: END, aggregation })
    ));
    expect(results[0].readings).toHaveLength(3);
    expect(results[1].readings).toHaveLength(1);
    expect(results[2].readings).toHaveLength(1);
    expect(results[1].energyTotals).toEqual(results[0].energyTotals);
    expect(results[2].energyTotals).toEqual(results[0].energyTotals);
    expect(results.map(result => result.sampledReadings)).toEqual([3, 3, 3]);
    expect(results[0].readings[0]).not.toHaveProperty("solarPanelAverageWatts");
  });

  it("retains a verified PV sample average and counts in a partial bucket while strict whole-bucket proof stays absent", async () => {
    const stored = [row(0, 0), row(1, 5, {
      solarPanelInputWatts: undefined, solarPanelReceivedAt: undefined, solarPanelMeasurement: undefined,
    }), row(2, 10, { solarPanelInputWatts: 400 })];
    const result = await runHistory(context(stored).ctx, { deviceId, startTime: START, endTime: END, aggregation: "1h" });
    expect(result.readings[0]).toMatchObject({
      solarPanelAverageWatts: 300, solarPanelSampleCount: 2, sampleCount: 3,
      solarPanelInputWatts: null, solarPanelMeasurement: null, solarPanelReceivedAt: null,
    });
    // Unknown endpoints remain breaks rather than zeros or a filtered bridge.
    expect(result.energyTotals).toMatchObject({ solarPanelInput: 0, solarPanelIntervals: 0, solarPanelCoveredMs: 0 });
  });

  it("preserves genuine zero panel measurements in averages and integration", async () => {
    const result = await runHistory(context([row(0, 0, { solarPanelInputWatts: 0 }), row(1, 5)]).ctx, {
      deviceId, startTime: START, endTime: END, aggregation: "1h",
    });
    expect(result.readings[0]).toMatchObject({ solarPanelAverageWatts: 100, solarPanelSampleCount: 2, sampleCount: 2 });
    expect(result.energyTotals?.solarPanelInput).toBeCloseTo(100 * (5 / 60) / 1000);
    expect(result.energyTotals?.solarPanelIntervals).toBe(1);
  });

  it("uses per-device chronological samples and never integrates between different devices", async () => {
    const stored = [row(0, 0), row(1, 10), row(2, 5, { deviceId: otherDeviceId, solarPanelInputWatts: 1_000 })];
    const result = await runHistory(context(stored, [deviceId, otherDeviceId]).ctx, {
      startTime: START, endTime: END, aggregation: "1h",
    });
    expect(result.readings).toHaveLength(2);
    expect(result.sampledReadings).toBe(3);
    expect(result.energyTotals?.solarPanelInput).toBeCloseTo(200 * (10 / 60) / 1000);
    expect(result.energyTotals?.solarPanelIntervals).toBe(1);
    expect(result.energyTotals?.solarPanelCoveredMs).toBe(10 * MINUTE);
  });

  it("sums station source energy and coverage per device without mixing independent PV into the split", async () => {
    const confirmed = { inputQuality: "consistent" as const, inputMeasurement: "delta2-pd-mqtt-v1" as const,
      inputWatts: 100, acInputWatts: 100, dcInputWatts: 0, solarInputWatts: 0 };
    const stored = [row(0, 0, confirmed), row(1, 5, confirmed),
      row(2, 0, { ...confirmed, deviceId: otherDeviceId }), row(3, 5, { ...confirmed, deviceId: otherDeviceId })];
    const result = await runHistory(context(stored, [deviceId, otherDeviceId]).ctx, { startTime: START, endTime: END });
    expect(result.energyTotals?.acInput).toBeCloseTo(2 * 100 * (5 / 60) / 1000);
    expect(result.energyTotals).toMatchObject({ sourceIntervals: 2, solarIntervals: 2,
      sourceCoveredMs: 10 * MINUTE, solarCoveredMs: 10 * MINUTE, solarInput: 0 });
    expect(result.energyTotals?.solarPanelInput).toBeCloseTo(2 * 200 * (5 / 60) / 1000);
  });

  it("clips panel receipt intervals to the requested query boundary", async () => {
    const endTime = START + 10 * MINUTE;
    const result = await runHistory(context([
      row(0, 0, { solarPanelReceivedAt: START + 5_000 }),
      row(1, 10, { solarPanelReceivedAt: endTime + 5_000 }),
    ]).ctx, { deviceId, startTime: START, endTime });
    expect(result.energyTotals?.solarPanelCoveredMs).toBe(10 * MINUTE - 5_000);
    expect(result.energyTotals?.solarPanelInput).toBeCloseTo(200 * (595 / 3600) / 1000);
  });

  const invalidEvidence: Partial<Doc<"deviceReadings">>[] = [
    { powerMeasurement: undefined }, { solarPanelMeasurement: undefined },
    { solarPanelInputWatts: -1 }, { solarPanelInputWatts: Number.NaN },
    { solarPanelInputWatts: Number.POSITIVE_INFINITY }, { solarPanelReceivedAt: undefined },
    { solarPanelReceivedAt: START + 5 * MINUTE + 5_001 },
  ];
  it.each(invalidEvidence)("excludes unverified or skewed PV samples from the derived average (%j)", async evidence => {
    const result = await runHistory(context([row(0, 0), row(1, 5, evidence)]).ctx, {
      deviceId, startTime: START, endTime: END, aggregation: "1h",
    });
    expect(result.readings[0]).toMatchObject({ solarPanelAverageWatts: 200, solarPanelSampleCount: 1, sampleCount: 2 });
    expect(result.energyTotals?.solarPanelIntervals).toBe(0);
  });

  it("keeps the existing dense-range read budget while reporting sampled raw points and positive energy", async () => {
    const stored = Array.from({ length: 1_000 }, (_, index) => row(index, index * 60 / 1_000));
    const memory = context(stored, [deviceId], 15);
    const result = await runHistory(memory.ctx, { deviceId, startTime: START, endTime: END, aggregation: "1h" });
    expect(result.sampledReadings).toBe(249);
    expect(result.samplingIntervalMs).toBe((END - START) / 249);
    expect(memory.documentsRead).toBe(500);
    expect(memory.readSizes[0]).toBe(250);
    expect(result.energyTotals?.solarPanelInput).toBeGreaterThan(0);
    expect(memory.indexes.filter(index => index.startsWith("deviceReadings.")))
      .toEqual(expect.arrayContaining(["deviceReadings.by_deviceId_readingKind_recordedAt"]));
    expect(memory.write).not.toHaveBeenCalled();
  });

  it("never widens an unsampled device's PV gap because another device used density sampling", async () => {
    const longEnd = START + 8 * 60 * MINUTE;
    vi.mocked(Date.now).mockReturnValue(longEnd);
    const dense = Array.from({ length: 600 }, (_, index) => row(index, index * 480 / 600));
    const confirmedSource = {
      deviceId: otherDeviceId, inputQuality: "consistent" as const,
      inputMeasurement: "delta2-pd-mqtt-v1" as const, inputWatts: 200,
      acInputWatts: 0, dcInputWatts: 200, solarInputWatts: 200, chargingType: 2,
    };
    const sparse = [row(600, 0, confirmedSource), row(601, 3, confirmedSource)];
    const stored = [...dense, ...sparse];
    const before = JSON.stringify(stored);
    const devices = [deviceId, otherDeviceId];
    const denseMemory = context(stored, devices, 1);
    const sparseMemory = context(stored, devices, 1);
    const combinedMemory = context(stored, devices, 1);
    const args = { startTime: START, endTime: longEnd, aggregation: "1h" };
    const denseResult = await runHistory(denseMemory.ctx, { ...args, deviceId });
    const sparseResult = await runHistory(sparseMemory.ctx, { ...args, deviceId: otherDeviceId });
    const combined = await runHistory(combinedMemory.ctx, args);

    expect(denseResult.samplingIntervalMs).toBe((longEnd - START) / 249);
    expect(sparseResult.samplingIntervalMs).toBeNull();
    expect(combined.samplingIntervalMs).toBe(denseResult.samplingIntervalMs);
    expect(sparseResult.energyTotals).toMatchObject({ solarPanelInput: 0, solarPanelIntervals: 0, solarPanelCoveredMs: 0 });
    expect(combined.energyTotals?.solarPanelInput).toBeCloseTo(denseResult.energyTotals!.solarPanelInput);
    expect(combined.energyTotals?.solarPanelIntervals).toBe(denseResult.energyTotals!.solarPanelIntervals);
    expect(combined.energyTotals?.solarPanelCoveredMs).toBe(denseResult.energyTotals!.solarPanelCoveredMs);
    expect(combined.energyTotals?.sourceCoveredMs).toBe(sparseResult.energyTotals!.sourceCoveredMs);
    expect(combined.energyTotals?.solarCoveredMs).toBe(sparseResult.energyTotals!.solarCoveredMs);
    expect(combined.energyTotals?.solarInput).toBeCloseTo(sparseResult.energyTotals!.solarInput);
    expect(denseMemory.documentsRead).toBe(500);
    expect(sparseMemory.documentsRead).toBe(2);
    expect(combinedMemory.documentsRead).toBe(502);
    expect(combined.sampledReadings).toBe(251);
    expect(combinedMemory.write).not.toHaveBeenCalled();
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("uses null for a missing per-device hint while preserving scalar compatibility for direct helper callers", () => {
    const mapped = [row(0, 0), row(1, 3)].map(reading => ({
      ...reading, acInputWatts: null, dcInputWatts: null, outputWatts: 100,
    }));
    const options = { collectionIntervalMinutes: 1, startTime: START, endTime: END };
    expect(calculateHistoryEnergyTotals(mapped, 120_000, options).solarPanelIntervals).toBe(1);
    const hints = new Map<string, number | null>();
    expect(calculateHistoryEnergyTotals(mapped, 120_000, options, hints).solarPanelIntervals).toBe(0);
    hints.set(deviceId, 120_000);
    expect(calculateHistoryEnergyTotals(mapped, null, options, hints).solarPanelIntervals).toBe(1);
  });

  it.each(["unauthenticated", "foreign", "inverted"])("returns compatible empty evidence without telemetry reads for %s requests", async condition => {
    const memory = context([row(0, 0), row(1, 5)]);
    if (condition === "unauthenticated") vi.mocked(auth.getUserId).mockResolvedValue(null);
    const result = await runHistory(memory.ctx, {
      deviceId: condition === "foreign" ? "foreign-device" as Id<"devices"> : deviceId,
      startTime: condition === "inverted" ? END : START, endTime: END,
    });
    expect(result).toEqual({ readings: [], summary: null, samplingIntervalMs: null, energyTotals: null, sampledReadings: 0,
      temperatureReadings: [], temperatureSamplingIntervalMs: null, temperatureSampledReadings: 0, temperatureSummary: null });
    expect(memory.documentsRead).toBe(0);
    expect(memory.write).not.toHaveBeenCalled();
    if (condition !== "foreign") expect(memory.query).not.toHaveBeenCalled();
  });

  it("sorts copies for pure integration without changing the caller's historical rows", () => {
    const mapped = [row(1, 5), row(0, 0)].map(reading => ({ ...reading, acInputWatts: null, dcInputWatts: null, outputWatts: 100 }));
    const before = JSON.stringify(mapped);
    const totals = calculateHistoryEnergyTotals(mapped, null, { collectionIntervalMinutes: 5, startTime: START, endTime: END });
    expect(totals.solarPanelInput).toBeCloseTo(200 * (5 / 60) / 1000);
    expect(JSON.stringify(mapped)).toBe(before);
  });
});
