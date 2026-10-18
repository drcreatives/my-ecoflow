import { describe, expect, it, vi } from "vitest";
import { mergeDisplayTelemetry, type DisplayTelemetry } from "../displayTelemetry";
import { recordDisplayTelemetry } from "../devices_internal";

const cache: DisplayTelemetry = {
  temperature: { value: 39, source: "rest-cache", receivedAt: 1_000 },
  acOutputWatts: { value: 148, source: "mqtt", receivedAt: 2_000 },
};

describe("display-only last reported telemetry merge", () => {
  it("preserves genuine zero values and leaves absent fields unchanged", () => {
    const before = JSON.stringify(cache);
    expect(mergeDisplayTelemetry(cache, { usbOutputWatts: { value: 0, source: "rest-cache", receivedAt: 3_000 } })).toEqual({
      ...cache, usbOutputWatts: { value: 0, source: "rest-cache", receivedAt: 3_000 },
    });
    expect(JSON.stringify(cache)).toBe(before);
  });

  it("never lets an older receipt replace a newer report, including an older live receipt", () => {
    expect(mergeDisplayTelemetry(cache, {
      temperature: { value: 20, source: "mqtt", receivedAt: 999 },
      acOutputWatts: { value: 99, source: "mqtt", receivedAt: 1_999 },
    })).toBe(cache);
  });

  it("does not let a later REST fetch overwrite an existing live report", () => {
    expect(mergeDisplayTelemetry(cache, { acOutputWatts: { value: 99, source: "rest-cache", receivedAt: 5_000 } })).toBe(cache);
  });

  it('preserves a newer thermal report when the concurrent power capture merges REST output cache', () => {
    const temperature = { value: 37, source: 'mqtt' as const, receivedAt: 5_000 };
    const live = mergeDisplayTelemetry(cache, { temperature });
    expect(mergeDisplayTelemetry(live, { dcOutputWatts: { value: 12, source: 'rest-cache', receivedAt: 6_000 } }))
      .toEqual({ ...cache, temperature, dcOutputWatts: { value: 12, source: 'rest-cache', receivedAt: 6_000 } });
  });

  it("accepts newer REST reports over REST and newer live reports over either source", () => {
    const rest = mergeDisplayTelemetry(cache, { temperature: { value: 40, source: "rest-cache", receivedAt: 2_000 } });
    expect(rest?.temperature).toEqual({ value: 40, source: "rest-cache", receivedAt: 2_000 });
    const live = mergeDisplayTelemetry(rest, { temperature: { value: 41, source: "mqtt", receivedAt: 3_000 } });
    expect(live?.temperature).toEqual({ value: 41, source: "mqtt", receivedAt: 3_000 });
    expect(mergeDisplayTelemetry(live, { temperature: { value: 42, source: "mqtt", receivedAt: 4_000 } })?.temperature?.value).toBe(42);
  });

  it.each([
    { value: NaN, receivedAt: 3_000 },
    { value: Infinity, receivedAt: 3_000 },
    { value: 39, receivedAt: NaN },
    { value: 39, receivedAt: Infinity },
    { value: 39, receivedAt: -1 },
  ])("rejects nonfinite measurements or invalid receipt times (%j)", (entry) => {
    expect(() => mergeDisplayTelemetry(cache, { temperature: { ...entry, source: "mqtt" } })).toThrow("Invalid display telemetry");
  });

  it("copies only the deliberate display entry fields", () => {
    const incoming = { temperature: { value: 39, source: "rest-cache" as const, receivedAt: 3_000, rawData: { secret: true } } };
    expect(mergeDisplayTelemetry(undefined, incoming)).toEqual({ temperature: { value: 39, source: "rest-cache", receivedAt: 3_000 } });
  });
});

interface StoredDevice {
  isActive: boolean;
  displayTelemetry?: DisplayTelemetry;
}
function makeContext(stored: StoredDevice | null = { isActive: true, displayTelemetry: cache }) {
  return {
    db: {
      get: vi.fn(async () => stored),
      patch: vi.fn(async (id: string, fields: { displayTelemetry: DisplayTelemetry }) => {
        void id;
        if (stored) Object.assign(stored, fields);
      }),
      query: vi.fn(), insert: vi.fn(), delete: vi.fn(),
    },
  };
}
const record = (recordDisplayTelemetry as unknown as {
  _handler: (ctx: ReturnType<typeof makeContext>, args: { deviceId: string; telemetry: DisplayTelemetry }) => Promise<null>;
})._handler;

describe("internal display telemetry recording", () => {
  it("atomically merges only device display metadata without reading or writing history", async () => {
    const ctx = makeContext();
    expect(await record(ctx, { deviceId: "owned-device", telemetry: { dcOutputWatts: { value: 0, source: "mqtt", receivedAt: 3_000 } } })).toBeNull();
    expect(ctx.db.patch).toHaveBeenCalledExactlyOnceWith("owned-device", {
      displayTelemetry: { ...cache, dcOutputWatts: { value: 0, source: "mqtt", receivedAt: 3_000 } },
    });
    expect(ctx.db.query).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.delete).not.toHaveBeenCalled();
  });

  it("does not patch storage when all incoming fields are stale or absent", async () => {
    const ctx = makeContext();
    await record(ctx, { deviceId: "owned-device", telemetry: {} });
    await record(ctx, { deviceId: "owned-device", telemetry: { acOutputWatts: { value: 99, source: "rest-cache", receivedAt: 5_000 } } });
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it.each([null, { isActive: false }])("refuses missing or inactive devices (%j)", async (stored) => {
    const ctx = makeContext(stored);
    await expect(record(ctx, { deviceId: "owned-device", telemetry: cache })).rejects.toThrow("Device unavailable");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
