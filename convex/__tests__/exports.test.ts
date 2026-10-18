import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc } from "../_generated/dataModel";
import { auth } from "../auth";
import { exportWindow, readingPage } from "../exports";
import { serializeReadingForExport } from "../readingExport";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const now = 1_800_000_000_000;
const device = { _id: "device", userId: "owner", deviceSn: "TEST-SERIAL", deviceName: "Test device" };
function makeContext(owned: typeof device | null = device) {
  const user: { _id: string; readingDeletionRevision?: number } = { _id: "owner" };
  const paginate = vi.fn(async () => ({
    page: [storedReading()], isDone: false, continueCursor: "next-page",
  }));
  const range = { eq: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis() };
  const withIndex = vi.fn((_name: string, build: (q: typeof range) => unknown) => {
    build(range);
    return { order: vi.fn(() => ({ paginate })) };
  });
  return { db: { get: vi.fn(async (id: string) => id === "owner" ? user : owned), query: vi.fn(() => ({ withIndex })) }, paginate, range, withIndex, user };
}
function storedReading() {
  return {
    _id: "reading", _creationTime: 1, deviceId: "device", recordedAt: now - 100,
    inputWatts: 0, acEnabled: false, inputMeasurement: "delta2-pd-mqtt-v1",
    rawData: { privateVendorData: "not-exported" }, acChargingWatts: 300,
  } as unknown as Doc<"deviceReadings">;
}
const page = (readingPage as unknown as {
  _handler: (ctx: ReturnType<typeof makeContext>, args: { deviceId: string; cursor: string | null; endTime: number; deletionRevision: number }) => Promise<{
    page: ReturnType<typeof serializeReadingForExport>[]; isDone: boolean; continueCursor: string;
  }>;
})._handler;
const window = (exportWindow as unknown as {
  _handler: (ctx: ReturnType<typeof makeContext>, args: Record<string, never>) => Promise<{ endTime: number; deletionRevision: number } | null>;
})._handler;

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(auth.getUserId).mockResolvedValue("owner" as Awaited<ReturnType<typeof auth.getUserId>>);
});
afterEach(() => vi.restoreAllMocks());

describe("complete reading export pages", () => {
  it("uses an authenticated server timestamp for the fixed export window", async () => {
    const ctx = makeContext();
    expect(await window(ctx, {})).toEqual({ endTime: now, deletionRevision: 0 });
    ctx.user.readingDeletionRevision = 5;
    expect(await window(ctx, {})).toEqual({ endTime: now, deletionRevision: 5 });
    vi.mocked(auth.getUserId).mockResolvedValue(null);
    expect(await window(ctx, {})).toBeNull();
  });
  it("authenticates before database access", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue(null);
    const ctx = makeContext();
    expect(await page(ctx, { deviceId: "device", cursor: null, endTime: now, deletionRevision: 0 })).toEqual({
      page: [], isDone: true, continueCursor: "", available: false,
    });
    expect(ctx.db.get).not.toHaveBeenCalled();
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it.each([null, { ...device, userId: "another-owner" }])("returns an empty page for a missing or unowned device", async owned => {
    const ctx = makeContext(owned);
    expect((await page(ctx, { deviceId: "device", cursor: null, endTime: now, deletionRevision: 0 })).page).toEqual([]);
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it("uses the full device index and passes continuation without chart sampling", async () => {
    const ctx = makeContext();
    const result = await page(ctx, { deviceId: "device", cursor: "previous-page", endTime: now, deletionRevision: 0 });
    expect(ctx.withIndex).toHaveBeenCalledWith("by_deviceId", expect.any(Function));
    expect(ctx.range.eq).toHaveBeenCalledWith("deviceId", "device");
    expect(ctx.range.lte).toHaveBeenCalledWith("_creationTime", now);
    expect(ctx.paginate).toHaveBeenCalledExactlyOnceWith({
      cursor: "previous-page", numItems: 100, maximumRowsRead: 100, maximumBytesRead: 512 * 1024,
    });
    expect(result).toMatchObject({ isDone: false, continueCursor: "next-page" });
    expect(result.page[0]).toMatchObject({ inputWatts: 0, acEnabled: false, acChargingWatts: 300 });
  });

  it.each([now + 1, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid export end %s", async endTime => {
    const ctx = makeContext();
    await expect(page(ctx, { deviceId: "device", cursor: null, endTime, deletionRevision: 0 })).rejects.toThrow("Invalid export end time");
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it("rejects cleanup between the export window and first page instead of returning shortened data", async () => {
    const ctx = makeContext();
    const snapshot = (await window(ctx, {}))!;
    ctx.user.readingDeletionRevision = 1;
    await expect(page(ctx, { deviceId: "device", cursor: null, ...snapshot })).rejects.toThrow("retention cleanup changed");
    expect(ctx.paginate).not.toHaveBeenCalled();
  });

  it.each(["same-device", "another-device"])("rejects deletion before the next %s page using the same owner revision", async nextDevice => {
    const ctx = makeContext();
    const snapshot = (await window(ctx, {}))!;
    const first = await page(ctx, { deviceId: "device", cursor: null, ...snapshot });
    expect(first.page).toHaveLength(1);
    ctx.user.readingDeletionRevision = 1;
    await expect(page(ctx, {
      deviceId: nextDevice === "same-device" ? "device" : "another-device",
      cursor: nextDevice === "same-device" ? first.continueCursor : null, ...snapshot,
    })).rejects.toThrow("retention cleanup changed");
    expect(ctx.paginate).toHaveBeenCalledOnce();
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("fails closed for a malformed export or stored deletion revision (%s)", async revision => {
    const ctx = makeContext();
    await expect(page(ctx, { deviceId: "device", cursor: null, endTime: now, deletionRevision: revision })).rejects.toThrow("Invalid reading deletion revision");
    ctx.user.readingDeletionRevision = revision;
    await expect(window(ctx, {})).rejects.toThrow("Invalid reading deletion revision");
    await expect(page(ctx, { deviceId: "device", cursor: null, endTime: now, deletionRevision: 0 })).rejects.toThrow("Invalid reading deletion revision");
    expect(ctx.paginate).not.toHaveBeenCalled();
  });

  it("does not turn an invalid or empty continuation into a successful export", async () => {
    const ctx = makeContext();
    await expect(page(ctx, { deviceId: "device", cursor: "", endTime: now, deletionRevision: 0 })).rejects.toThrow("Invalid export cursor");
    expect(ctx.paginate).not.toHaveBeenCalled();
    ctx.paginate.mockRejectedValueOnce(new Error("InvalidCursor"));
    await expect(page(ctx, { deviceId: "device", cursor: "malformed-opaque-cursor", endTime: now, deletionRevision: 0 })).rejects.toThrow("InvalidCursor");
  });

  it("preserves scalar evidence/configuration, real zero and false while excluding raw/private metadata", () => {
    const result = serializeReadingForExport(storedReading(), device);
    expect(result).toMatchObject({
      recordedAt: now - 100, deviceSn: "TEST-SERIAL", deviceName: "Test device",
      inputWatts: 0, acEnabled: false, acChargingWatts: 300,
      inputMeasurement: "delta2-pd-mqtt-v1", solarInputWatts: null, temperature: null,
    });
    expect(result).not.toHaveProperty("rawData");
    expect(result).not.toHaveProperty("_id");
    expect(result).not.toHaveProperty("_creationTime");
    expect(result).not.toHaveProperty("deviceId");
    expect(result).not.toHaveProperty("userId");
  });

  it("exports actual thermal events with provenance and no fabricated power or private fields", async () => {
    const thermal = {
      _id: "thermal-observation", _creationTime: now - 5, deviceId: device._id,
      readingKind: "temperature", temperatureMeasurement: "bms-generic-mqtt-v1",
      temperature: 0, recordedAt: now - 10, rawData: { privateVendorData: "never-export" },
    } as unknown as Doc<"deviceReadings">;
    const ctx = makeContext();
    ctx.paginate.mockResolvedValueOnce({ page: [storedReading(), thermal], isDone: false, continueCursor: "next-page" });
    const before = structuredClone(thermal);
    const result = await page(ctx, { deviceId: "device", cursor: null, endTime: now, deletionRevision: 0 });
    expect(result.page).toHaveLength(2);
    expect(result.page[1]).toMatchObject({ readingKind: "temperature", temperatureMeasurement: "bms-generic-mqtt-v1", temperature: 0, recordedAt: now - 10 });
    for (const field of ["batteryLevel", "inputWatts", "acInputWatts", "dcInputWatts", "solarInputWatts", "outputWatts", "acOutputWatts", "dcOutputWatts", "usbOutputWatts", "powerMeasurement", "solarPanelMeasurement", "status"] as const) {
      expect(result.page[1][field]).toBeNull();
    }
    expect(ctx.range.eq.mock.calls).toEqual([["deviceId", "device"]]);
    expect(ctx.range.lte).toHaveBeenCalledWith("_creationTime", now);
    expect(JSON.stringify(result.page[1])).not.toMatch(/never-export|rawData|_id|_creationTime|deviceId|userId/);
    expect(thermal).toEqual(before);
  });
});
