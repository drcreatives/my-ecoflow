import { describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { aggregateReadings, insertReading, validateReadingEvidence } from "../readings";
import { serializeReadingForExport } from "../readingExport";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const now = 1_800_000_000_000;
const evidence = {
  inputWatts: 221, outputWatts: 198, recordedAt: now,
  powerMeasurement: "pd-totals-mqtt-v1" as const,
  solarPanelInputWatts: 226, solarPanelReceivedAt: now + 1_000,
  solarPanelMeasurement: "delta2-mppt-mqtt-v1" as const,
};
type ReadingRow = Parameters<typeof aggregateReadings>[0][number];
function row(overrides: Partial<ReadingRow> = {}): ReadingRow {
  return {
    ...evidence, batteryLevel: 99,
    acInputWatts: null, dcInputWatts: null, solarInputWatts: null,
    chargingType: null, inputQuality: "incomplete", inputMeasurement: null,
    acOutputWatts: 130, dcOutputWatts: 63, usbOutputWatts: 5,
    remainingTime: null, temperature: null, status: "charging", ...overrides,
  };
}

describe("independent reading evidence", () => {
  it("accepts a separate panel measurement above station input without inventing AC or clamping PV", async () => {
    const insert = vi.fn().mockResolvedValue("new-reading");
    const handler = (insertReading as unknown as {
      _handler: (ctx: { db: { insert: typeof insert } }, args: typeof evidence & { deviceId: Id<"devices"> }) => Promise<string>;
    })._handler;
    await handler({ db: { insert } }, { ...evidence, deviceId: "test-device" as Id<"devices"> });
    const stored = insert.mock.calls[0][1];
    expect(stored).toMatchObject(evidence);
    expect(stored.acInputWatts).toBeUndefined();
    expect(stored.dcInputWatts).toBeUndefined();
    expect(stored.solarInputWatts).toBeUndefined();
    expect(stored.inputMeasurement).toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("keeps existing reading paths valid and genuine panel zero intact", () => {
    expect(() => validateReadingEvidence({ recordedAt: now })).not.toThrow();
    expect(() => validateReadingEvidence({ ...evidence, solarPanelInputWatts: 0 })).not.toThrow();
  });

  it.each([
    { inputWatts: undefined }, { inputWatts: Number.NaN }, { outputWatts: -1 },
    { solarPanelInputWatts: undefined }, { solarPanelInputWatts: -1 },
    { solarPanelInputWatts: Number.POSITIVE_INFINITY },
    { solarPanelReceivedAt: undefined }, { solarPanelReceivedAt: Number.NaN },
    { solarPanelReceivedAt: now + 5_001 }, { solarPanelReceivedAt: now - 5_001 },
    { solarPanelMeasurement: undefined }, { powerMeasurement: undefined },
  ])("rejects incomplete or invalid new evidence before an insert (%j)", invalid => {
    expect(() => validateReadingEvidence({ ...evidence, ...invalid })).toThrow(/Invalid/);
  });

  it("averages panel watts independently without completing an unavailable station split", () => {
    const original = [row(), row({ solarPanelInputWatts: 231, recordedAt: now + 1_000 })];
    const before = structuredClone(original);
    const [averaged] = aggregateReadings(original, "5m");
    expect(averaged).toMatchObject({
      inputWatts: 221, solarPanelInputWatts: 228.5, solarPanelReceivedAt: null,
      solarPanelMeasurement: "delta2-mppt-mqtt-v1", powerMeasurement: "pd-totals-mqtt-v1",
      acInputWatts: null, dcInputWatts: null, solarInputWatts: null,
      inputQuality: "incomplete", inputMeasurement: null,
    });
    expect(original).toEqual(before);
  });

  it("does not fill a missing panel measurement when averaging a bucket", () => {
    const [averaged] = aggregateReadings([
      row({ solarPanelInputWatts: 0 }), row({ solarPanelInputWatts: null, solarPanelMeasurement: null }),
    ], "5m");
    expect(averaged.solarPanelInputWatts).toBeNull();
    expect(averaged.solarPanelMeasurement).toBeNull();
  });

  it("exports deliberate provenance and zero values while keeping old records absent", () => {
    const device = { deviceSn: "TEST-SERIAL", deviceName: "Test device" };
    const fresh = serializeReadingForExport({ ...evidence, solarPanelInputWatts: 0 } as unknown as Doc<"deviceReadings">, device);
    expect(fresh).toMatchObject({ ...evidence, solarPanelInputWatts: 0 });
    expect(fresh.solarInputWatts).toBeNull();
    const legacy = serializeReadingForExport({ recordedAt: now } as unknown as Doc<"deviceReadings">, device);
    expect(legacy).toMatchObject({ powerMeasurement: null, solarPanelInputWatts: null,
      solarPanelReceivedAt: null, solarPanelMeasurement: null });
    expect(legacy).not.toHaveProperty("rawData");
    expect(legacy).not.toHaveProperty("deviceId");
  });
});
