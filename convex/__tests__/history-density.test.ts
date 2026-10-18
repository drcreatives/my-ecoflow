import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { auth } from "../auth";
import { history } from "../readings";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const startTime = 1_700_000_000_000;
const endTime = startTime + 60 * 60 * 1000;
const deviceId = "owned-device" as Id<"devices">;
const runHistory = (history as unknown as {
  _handler: (ctx: QueryCtx, args: { deviceId?: Id<"devices">; startTime: number; endTime: number; aggregation?: string }) => Promise<{
    readings: Array<{ recordedAt: number; inputQuality: string | null; inputMeasurement: string | null; solarInputWatts: number | null; chargingTypeSource: string | null }>;
    summary: { totalReadings: number } | null;
    samplingIntervalMs: number | null;
  }>;
})._handler;

interface StoredRow {
  _id: string;
  _creationTime: number;
  deviceId: Id<"devices">;
  recordedAt: number;
  inputQuality: "consistent";
  inputMeasurement?: "delta2-pd-v1" | "legacy-modules";
  solarInputWatts?: number;
  chargingTypeSource?: "live-pd" | "device-setting";
  inputWatts: number;
  acInputWatts: number;
  dcInputWatts: number;
}

function rows(count: number, rangeEnd = endTime): StoredRow[] {
  return Array.from({ length: count }, (_, index) => ({
    _id: `reading-${index}`, _creationTime: index, deviceId,
    recordedAt: startTime + index * ((rangeEnd - startTime) / count),
    inputQuality: "consistent", inputWatts: 100, acInputWatts: 0, dcInputWatts: 100,
  }));
}

function makeContext(storedRows: StoredRow[], collectionIntervalMinutes = 15) {
  let documentsRead = 0;
  const indexNames: string[] = [];
  const readSizes: number[] = [];
  const readRows = (selected: StoredRow[]) => {
    documentsRead += selected.length;
    readSizes.push(selected.length);
    return selected;
  };

  const query = vi.fn((table: string) => {
    if (table !== "deviceReadings") {
      return {
        withIndex: (index: string) => {
          indexNames.push(`${table}.${index}`);
          return {
            collect: async () => [{ _id: deviceId, userId: "owner", deviceName: "Test device", deviceSn: "TEST-DEVICE" }],
            first: async () => ({ collectionIntervalMinutes }),
          };
        },
      };
    }

    let direction: "asc" | "desc" = "asc";
    const filters: Array<(row: StoredRow) => boolean> = [];
    const range = {
      eq: (field: keyof StoredRow, value: unknown) => { filters.push((row) => row[field] === value); return range; },
      gte: (field: "recordedAt", value: number) => { filters.push((row) => row[field] >= value); return range; },
      lte: (field: "recordedAt", value: number) => { filters.push((row) => row[field] <= value); return range; },
      lt: (field: "recordedAt", value: number) => { filters.push((row) => row[field] < value); return range; },
    };
    const selected = () => storedRows
      .filter((row) => filters.every((filter) => filter(row)))
      .sort((left, right) => (direction === "asc" ? 1 : -1) * (left.recordedAt - right.recordedAt || left._creationTime - right._creationTime));
    const builder = {
      withIndex: (index: string, configure: (q: typeof range) => unknown) => {
        indexNames.push(`${table}.${index}`);
        configure(range);
        return builder;
      },
      order: (value: "asc" | "desc") => { direction = value; return builder; },
      take: async (count: number) => readRows(selected().slice(0, count)),
      first: async () => readRows(selected().slice(0, 1))[0] ?? null,
    };
    return builder;
  });
  return {
    ctx: { db: { query } } as unknown as QueryCtx,
    query, indexNames, readSizes, get documentsRead() { return documentsRead; },
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(endTime);
  vi.mocked(auth.getUserId).mockResolvedValue("owner" as Awaited<ReturnType<typeof auth.getUserId>>);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("history density independent of scheduled collection cadence", () => {
  it("returns measurement provenance without changing existing stored historical rows", async () => {
    const stored = rows(3);
    stored[1].inputMeasurement = "delta2-pd-v1";
    stored[1].solarInputWatts = 100;
    stored[1].chargingTypeSource = "device-setting";
    stored[2].inputMeasurement = "legacy-modules";
    stored[2].chargingTypeSource = "live-pd";
    const before = JSON.stringify(stored);
    const context = makeContext(stored);
    const result = await runHistory(context.ctx, { deviceId, startTime, endTime });
    expect(result.readings.map((reading) => reading.inputMeasurement)).toEqual([null, "delta2-pd-v1", "legacy-modules"]);
    expect(result.readings.map((reading) => reading.solarInputWatts)).toEqual([null, 100, null]);
    expect(result.readings.map((reading) => reading.chargingTypeSource)).toEqual([null, "device-setting", "live-pd"]);
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("returns all 30 manual readings across the hour with a 15-minute cron interval", async () => {
    const stored = rows(30);
    const context = makeContext(stored);
    const result = await runHistory(context.ctx, { deviceId, startTime, endTime });
    expect(result.readings.map((row) => row.recordedAt)).toEqual(stored.map((row) => row.recordedAt));
    expect(result.summary?.totalReadings).toBe(30);
    expect(result.samplingIntervalMs).toBeNull();
    expect(context.documentsRead).toBe(30);
    expect(context.indexNames).toContain("deviceReadings.by_deviceId_readingKind_recordedAt");
  });

  it("retains 250 exact readings without sampling when the first batch covers the full range", async () => {
    const context = makeContext(rows(250));
    const result = await runHistory(context.ctx, { deviceId, startTime, endTime });
    expect(result.readings).toHaveLength(250);
    expect(result.samplingIntervalMs).toBeNull();
    expect(context.documentsRead).toBe(251);
  });

  it("switches a dense short range to uniform sampling without exceeding 500 document reads", async () => {
    const context = makeContext(rows(1000));
    const result = await runHistory(context.ctx, { deviceId, startTime, endTime });
    expect(result.readings).toHaveLength(249);
    expect(result.samplingIntervalMs).toBe((endTime - startTime) / 249);
    expect(result.readings[0].recordedAt).toBeLessThan(startTime + 60_000);
    expect(result.readings.at(-1)?.recordedAt).toBeGreaterThan(endTime - 60_000);
    expect(result.readings.map((row) => row.recordedAt)).toEqual(result.readings.map((row) => row.recordedAt).sort((a, b) => a - b));
    expect(context.documentsRead).toBe(500);
    expect(context.readSizes[0]).toBe(250);
  });

  it("detects overflow even when all readings share a timestamp", async () => {
    const context = makeContext(rows(300).map((row) => ({ ...row, recordedAt: startTime + 1_000 })));
    const result = await runHistory(context.ctx, { deviceId, startTime, endTime });
    expect(result.samplingIntervalMs).toBe((endTime - startTime) / 249);
    expect(result.readings).toHaveLength(1);
    expect(context.documentsRead).toBeLessThanOrEqual(500);
  });

  it("preserves the existing 500-window long-range read budget and reports its actual interval", async () => {
    const longEnd = startTime + 30 * 24 * 60 * 60 * 1000;
    vi.mocked(Date.now).mockReturnValue(longEnd);
    const context = makeContext(rows(2000, longEnd));
    const result = await runHistory(context.ctx, { deviceId, startTime, endTime: longEnd });
    expect(result.readings).toHaveLength(500);
    expect(result.samplingIntervalMs).toBe((longEnd - startTime) / 500);
    expect(context.documentsRead).toBe(500);
    expect(context.readSizes.every((size) => size <= 1)).toBe(true);
  });

  it("still caps a future end time and excludes readings beyond that cutoff", async () => {
    const context = makeContext([...rows(30), { ...rows(1)[0], _id: "future", recordedAt: endTime + 1_000 }]);
    const result = await runHistory(context.ctx, { deviceId, startTime, endTime: endTime + 60_000 });
    expect(result.readings).toHaveLength(30);
    expect(result.readings.every((row) => row.recordedAt <= endTime)).toBe(true);
  });

  it("preserves authentication and device ownership before reading telemetry", async () => {
    const context = makeContext(rows(30));
    vi.mocked(auth.getUserId).mockResolvedValue(null);
    expect(await runHistory(context.ctx, { deviceId, startTime, endTime })).toMatchObject({ readings: [], summary: null });
    expect(context.query).not.toHaveBeenCalled();
    vi.mocked(auth.getUserId).mockResolvedValue("owner" as Awaited<ReturnType<typeof auth.getUserId>>);
    expect(await runHistory(context.ctx, { deviceId: "foreign-device" as Id<"devices">, startTime, endTime })).toMatchObject({ readings: [], summary: null });
    expect(context.documentsRead).toBe(0);
  });
});
