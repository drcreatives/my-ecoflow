import { afterEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { aggregateReadings, claimRefreshAttempt, recordCollectionStatus } from "../readings";

const deviceId = "test-device" as Id<"devices">;
const now = 1_790_000_000_000;
type ClaimArgs = { deviceId: Id<"devices">; force?: boolean };
const claim = (claimRefreshAttempt as unknown as {
  _handler: (ctx: MutationCtx, args: ClaimArgs) => Promise<{ allowed: boolean; reason: string; retryAfterMs: number }>;
})._handler;
const recordStatus = (recordCollectionStatus as unknown as {
  _handler: (ctx: MutationCtx, args: { deviceId: Id<"devices">; status: "online" | "offline" | "error"; checkedAt: number }) => Promise<void>;
})._handler;

function makeContext(options: { latestAt?: number; lastAttempt?: number; lastCheck?: number; active?: boolean } = {}) {
  const device = {
    _id: deviceId,
    isActive: options.active ?? true,
    lastRefreshAttemptAt: options.lastAttempt,
    lastStatusCheckAt: options.lastCheck,
  };
  const patch = vi.fn(async (_id: unknown, fields: Record<string, unknown>) => { Object.assign(device, fields); });
  const first = vi.fn(async () => options.latestAt === undefined ? null : { recordedAt: options.latestAt });
  const order = vi.fn(() => ({ first }));
  const withIndex = vi.fn(() => ({ order }));
  const query = vi.fn(() => ({ withIndex }));
  const ctx = { db: { get: vi.fn(async () => device), patch, query } } as unknown as MutationCtx;
  return { ctx, device, patch, withIndex, query };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("atomic on-demand refresh limits", () => {
  it("skips an automatic fetch when the stored reading is recent", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const { ctx, patch, withIndex } = makeContext({ latestAt: now - 10_000 });
    expect(await claim(ctx, { deviceId })).toEqual({ allowed: false, reason: "fresh", retryAfterMs: 110_000 });
    expect(withIndex).toHaveBeenCalledWith("by_deviceId_readingKind_recordedAt", expect.any(Function));
    expect(patch).not.toHaveBeenCalled();
  });

  it("allows a manual fetch after a recent cron reading, then limits repeat requests", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const { ctx, patch } = makeContext({ latestAt: now - 10_000 });
    expect(await claim(ctx, { deviceId, force: true })).toMatchObject({ allowed: true, reason: "allowed" });
    expect(await claim(ctx, { deviceId, force: true })).toEqual({ allowed: false, reason: "rate_limited", retryAfterMs: 120_000 });
    expect(patch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(now + 120_000);
    expect(await claim(ctx, { deviceId, force: true })).toMatchObject({ allowed: true });
  });

  it("does not let force bypass another pending attempt", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const { ctx, patch } = makeContext({ lastAttempt: now - 30_000 });
    expect(await claim(ctx, { deviceId, force: true })).toEqual({ allowed: false, reason: "rate_limited", retryAfterMs: 90_000 });
    expect(patch).not.toHaveBeenCalled();
  });

  it("rejects inactive devices before reserving an attempt", async () => {
    const { ctx, patch } = makeContext({ active: false });
    await expect(claim(ctx, { deviceId })).rejects.toThrow("Device unavailable");
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("collection health", () => {
  it("preserves the last successful reading when an offline check completes", async () => {
    const { ctx, patch } = makeContext();
    await recordStatus(ctx, { deviceId, status: "offline", checkedAt: now });
    expect(patch).toHaveBeenCalledWith(deviceId, { connectionStatus: "offline", lastStatusCheckAt: now });
  });

  it("ignores an older request completing after a newer status check", async () => {
    const { ctx, patch } = makeContext({ lastCheck: now });
    await recordStatus(ctx, { deviceId, status: "error", checkedAt: now - 1 });
    expect(patch).not.toHaveBeenCalled();
  });

  it("lets a later live receipt supersede an intervening failed attempt and rejects its late duplicate", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now + 5_000);
    const { ctx, patch } = makeContext();
    await recordStatus(ctx, { deviceId, status: "error", checkedAt: now + 2_000 });
    await recordStatus(ctx, { deviceId, status: "online", checkedAt: now + 4_000 });
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenLastCalledWith(deviceId, {
      connectionStatus: "online", lastStatusCheckAt: now + 4_000, lastRefreshSucceededAt: now + 5_000,
    });
    await recordStatus(ctx, { deviceId, status: "error", checkedAt: now + 2_000 });
    expect(patch).toHaveBeenCalledTimes(2);
  });

  it("does not let an older live receipt erase a genuinely newer failed probe", async () => {
    const { ctx, patch } = makeContext({ lastCheck: now + 4_000 });
    await recordStatus(ctx, { deviceId, status: "online", checkedAt: now + 2_000 });
    expect(patch).not.toHaveBeenCalled();
  });
});

function row(overrides: Partial<Parameters<typeof aggregateReadings>[0][number]> = {}) {
  return {
    deviceId, batteryLevel: 50, inputWatts: 100, acInputWatts: 0, dcInputWatts: 100,
    chargingType: 2, inputQuality: "consistent" as const, outputWatts: 50,
    acOutputWatts: 50, dcOutputWatts: 0, usbOutputWatts: 0, remainingTime: 100,
    temperature: 25, status: "charging", recordedAt: now, ...overrides,
  };
}

describe("source quality in history aggregation", () => {
  it("retains charging-type provenance only when every reading has the same source", () => {
    expect(aggregateReadings([row({ chargingTypeSource: "device-setting" }), row({ chargingTypeSource: "device-setting" })], "1h")[0].chargingTypeSource).toBe("device-setting");
    expect(aggregateReadings([row({ chargingTypeSource: "live-pd" }), row({ chargingTypeSource: "device-setting" })], "1h")[0].chargingTypeSource).toBeUndefined();
    expect(aggregateReadings([row({ chargingTypeSource: "device-setting" }), row()], "1h")[0].chargingTypeSource).toBeUndefined();
  });

  it("preserves measured solar in an hourly AC-to-solar bucket without a shared charging type", () => {
    const bucket = aggregateReadings([
      row({ inputMeasurement: "delta2-pd-v1", chargingType: 3, acInputWatts: 100, dcInputWatts: 0, solarInputWatts: 0 }),
      row({ inputMeasurement: "delta2-pd-v1", chargingType: 2, acInputWatts: 0, dcInputWatts: 100, solarInputWatts: 100 }),
    ], "1h");
    expect(bucket[0]).toMatchObject({ inputMeasurement: "delta2-pd-v1", chargingType: null,
      acInputWatts: 50, dcInputWatts: 50, solarInputWatts: 50 });
  });

  it("does not replace absent or unknown solar measurement with zero during aggregation", () => {
    expect(aggregateReadings([row({ solarInputWatts: 100 }), row()], "1h")[0].solarInputWatts).toBeNull();
    expect(aggregateReadings([row({ solarInputWatts: 100 }), row({ solarInputWatts: NaN })], "1h")[0].solarInputWatts).toBeNull();
  });

  it("preserves matching measurement provenance and clears mixed or historical provenance", () => {
    expect(aggregateReadings([row({ inputMeasurement: "delta2-pd-v1" }), row({ inputMeasurement: "delta2-pd-v1" })], "1h")[0].inputMeasurement).toBe("delta2-pd-v1");
    expect(aggregateReadings([row({ inputMeasurement: "delta2-pd-v1" }), row({ inputMeasurement: "legacy-modules" })], "1h")[0].inputMeasurement).toBeNull();
    expect(aggregateReadings([row({ inputMeasurement: "delta2-pd-v1" }), row()], "1h")[0].inputMeasurement).toBeNull();
    expect(aggregateReadings([row(), row()], "1h")[0].inputMeasurement).toBeNull();
  });

  it("does not advertise a whole bucket as solar after a source transition", () => {
    const bucket = aggregateReadings([row(), row({ chargingType: 3, acInputWatts: 100, dcInputWatts: 0 })], "1h");
    expect(bucket[0]).toMatchObject({ inputQuality: "consistent", chargingType: null, acInputWatts: 50, dcInputWatts: 50 });
  });

  it("retains uncertainty when any contributing reading has conflicting input", () => {
    expect(aggregateReadings([row(), row({ inputQuality: "inconsistent", dcInputWatts: 378 })], "1h")[0].inputQuality).toBe("inconsistent");
    expect(aggregateReadings([row(), row({ inputQuality: null })], "1h")[0].inputQuality).toBeNull();
  });

  it("does not combine different devices into a shared source bucket", () => {
    const bucket = aggregateReadings([row(), row({ deviceId: "another-device" as Id<"devices">, acInputWatts: 100, dcInputWatts: 0 })], "1h");
    expect(bucket).toHaveLength(2);
    expect(bucket.map((value) => value.dcInputWatts)).toEqual([100, 0]);
  });
});
