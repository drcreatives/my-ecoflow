import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordTemperatureObservation } from "../devices_internal";
import type { DisplayTelemetry } from "../displayTelemetry";

const now = 1_800_000_000_000;
const deviceId = "test-device";
const leaseToken = "active-temperature-session";
interface StoredDevice {
  isActive: boolean;
  mqttLeases?: { temperature?: { token: string; expiresAt: number } };
  displayTelemetry?: DisplayTelemetry;
}
type StoredReading = Record<string, unknown> & { deviceId: string; recordedAt: number };
interface Args { deviceId: string; temperature: number; receivedAt: number; leaseToken: string }

function activeDevice(): StoredDevice {
  return {
    isActive: true,
    mqttLeases: { temperature: { token: leaseToken, expiresAt: now + 300_000 } },
    displayTelemetry: { acOutputWatts: { value: 120, source: "mqtt", receivedAt: now - 1_000 } },
  };
}

function makeContext(device: StoredDevice | null = activeDevice(), readings: StoredReading[] = []) {
  const indexedRanges: Array<{ index: string; equalities: Record<string, unknown> }> = [];
  return {
    indexedRanges,
    readings,
    db: {
      get: vi.fn(async () => device),
      query: vi.fn((table: string) => {
        expect(table).toBe("deviceReadings");
        const equalities: Record<string, unknown> = {};
        let descending = false;
        const range = { eq: (field: string, value: unknown) => { equalities[field] = value; return range; } };
        const query = {
          withIndex: (index: string, callback: (q: typeof range) => unknown) => {
            callback(range);
            indexedRanges.push({ index, equalities });
            return query;
          },
          order: (direction: string) => { descending = direction === "desc"; return query; },
          first: async () => {
            const matching = readings.filter(row => Object.entries(equalities).every(([key, value]) => row[key] === value));
            matching.sort((left, right) => descending ? right.recordedAt - left.recordedAt : left.recordedAt - right.recordedAt);
            return matching[0] ?? null;
          },
        };
        return query;
      }),
      insert: vi.fn(async (table: string, row: StoredReading) => {
        expect(table).toBe("deviceReadings");
        readings.push({ ...row });
        return "new-temperature-observation";
      }),
      patch: vi.fn(async (id: string, fields: { displayTelemetry?: DisplayTelemetry }) => {
        expect(id).toBe(deviceId);
        if (device) Object.assign(device, fields);
      }),
      delete: vi.fn(),
    },
  };
}

const record = (recordTemperatureObservation as unknown as {
  _handler: (ctx: ReturnType<typeof makeContext>, args: Args) => Promise<null>;
})._handler;
const args: Args = { deviceId, temperature: 39, receivedAt: now - 50, leaseToken };

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); });

describe("durable generic BMS temperature observations", () => {
  it("appends only the explicit temperature at its original receipt and atomically merges display", async () => {
    const device = activeDevice();
    const powerRow = { deviceId, inputWatts: 350, acInputWatts: 0, solarPanelInputWatts: 355, recordedAt: now - 100 };
    const unchangedPower = JSON.stringify(powerRow);
    const ctx = makeContext(device, [powerRow]);

    expect(await record(ctx, args)).toBeNull();
    expect(ctx.db.insert).toHaveBeenCalledExactlyOnceWith("deviceReadings", {
      deviceId, readingKind: "temperature", temperature: 39,
      temperatureMeasurement: "bms-generic-mqtt-v1", recordedAt: now - 50,
    });
    expect(ctx.db.patch).toHaveBeenCalledExactlyOnceWith(deviceId, {
      displayTelemetry: {
        acOutputWatts: { value: 120, source: "mqtt", receivedAt: now - 1_000 },
        temperature: { value: 39, source: "mqtt", receivedAt: now - 50 },
      },
    });
    expect(JSON.stringify(powerRow)).toBe(unchangedPower);
    expect(ctx.indexedRanges).toEqual([
      { index: "by_deviceId_readingKind_recordedAt", equalities: { deviceId, readingKind: "temperature", recordedAt: now - 50 } },
      { index: "by_deviceId_readingKind_recordedAt", equalities: { deviceId, readingKind: "temperature" } },
    ]);
    expect(ctx.db.delete).not.toHaveBeenCalled();
  });

  it("preserves a genuine zero and records the same temperature again only at a new receipt", async () => {
    const ctx = makeContext();
    await record(ctx, { ...args, temperature: 0 });
    await record(ctx, { ...args, temperature: 0, receivedAt: args.receivedAt + 1 });
    expect(ctx.readings.map(row => [row.temperature, row.recordedAt])).toEqual([[0, now - 50], [0, now - 49]]);
    expect(ctx.db.insert).toHaveBeenCalledTimes(2);
    expect(ctx.db.patch).toHaveBeenCalledTimes(2);
  });

  it.each([39, 40])("ignores a duplicate receipt even when its value is %s", async temperature => {
    const ctx = makeContext();
    await record(ctx, args);
    await record(ctx, { ...args, temperature });
    expect(ctx.db.insert).toHaveBeenCalledTimes(1);
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
  });

  it("ignores an indexed duplicate even if display telemetry is absent", async () => {
    const existing = { deviceId, readingKind: "temperature", temperature: 37, recordedAt: args.receivedAt };
    const ctx = makeContext(activeDevice(), [existing]);
    await record(ctx, args);
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.readings).toEqual([existing]);
  });

  it("ignores a receipt older than the newest durable observation", async () => {
    const existing = { deviceId, readingKind: "temperature", temperature: 38, recordedAt: now - 10 };
    const ctx = makeContext(activeDevice(), [existing]);
    await record(ctx, args);
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it.each([now - 49, now - 50])("ignores a receipt behind or equal to the existing MQTT display receipt (%s)", async receivedAt => {
    const device = activeDevice();
    device.displayTelemetry = { temperature: { value: 37, source: "mqtt", receivedAt } };
    const ctx = makeContext(device);
    await record(ctx, args);
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("does not confuse another device or a power reading at the same timestamp with a duplicate", async () => {
    const ctx = makeContext(activeDevice(), [
      { deviceId: "another-device", readingKind: "temperature", temperature: 39, recordedAt: args.receivedAt },
      { deviceId, temperature: 38, inputWatts: 350, recordedAt: args.receivedAt },
    ]);
    await record(ctx, args);
    expect(ctx.db.insert).toHaveBeenCalledTimes(1);
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
  });

  it("replaces a REST display cache only with the actual new MQTT observation", async () => {
    const device = activeDevice();
    device.displayTelemetry = { temperature: { value: 99, source: "rest-cache", receivedAt: now } };
    const ctx = makeContext(device);
    await record(ctx, args);
    expect(device.displayTelemetry?.temperature).toEqual({ value: 39, source: "mqtt", receivedAt: args.receivedAt });
    expect(ctx.db.insert).toHaveBeenCalledTimes(1);
  });

  it.each([
    { token: "old-session", expiresAt: now + 1 },
    { token: leaseToken, expiresAt: now },
    { token: leaseToken, expiresAt: now - 1 },
    { token: leaseToken, expiresAt: Infinity },
  ])("ignores superseded or invalid leases (%j)", async lease => {
    const device = activeDevice();
    device.mqttLeases = { temperature: lease };
    const ctx = makeContext(device);
    await record(ctx, args);
    expect(ctx.db.query).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("requires an active temperature lease", async () => {
    const device = activeDevice();
    delete device.mqttLeases;
    const ctx = makeContext(device);
    await record(ctx, args);
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("ignores a pre-session receipt even with the new lease token and an older display value", async () => {
    const device = activeDevice();
    device.mqttLeases = { temperature: { token: leaseToken, expiresAt: now + 360_000 } };
    device.displayTelemetry = { temperature: { value: 37, source: "mqtt", receivedAt: now - 2_000 } };
    const ctx = makeContext(device);
    await record(ctx, { ...args, receivedAt: now - 1_000 });
    expect(ctx.db.query).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it.each([now - 360_001, now + 5_001])("ignores stale or invalid future receipt %s without changing history or display", async receivedAt => {
    const ctx = makeContext();
    await record(ctx, { ...args, receivedAt });
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it.each([now - 359_999, now + 5_000])("accepts the bounded receipt edge %s without changing its timestamp", async receivedAt => {
    const device = activeDevice();
    device.mqttLeases = { temperature: { token: leaseToken, expiresAt: now + 1 } };
    const ctx = makeContext(device);
    await record(ctx, { ...args, receivedAt });
    expect(ctx.db.insert.mock.calls[0]?.[1].recordedAt).toBe(receivedAt);
  });

  it.each([
    { temperature: NaN }, { temperature: Infinity }, { temperature: -Infinity },
    { receivedAt: NaN }, { receivedAt: Infinity }, { receivedAt: -1 },
  ])("rejects nonfinite measurements and invalid receipt values (%j)", async invalid => {
    const ctx = makeContext();
    await expect(record(ctx, { ...args, ...invalid })).rejects.toThrow("Invalid temperature observation");
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it.each([null, { isActive: false }])("rejects a missing or inactive device (%j)", async device => {
    const ctx = makeContext(device);
    await expect(record(ctx, args)).rejects.toThrow("Device unavailable");
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
