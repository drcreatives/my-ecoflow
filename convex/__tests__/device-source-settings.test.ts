import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "../auth";
import { get, getBySn, list, update } from "../devices";
import type { DcInputSource } from "../readingQuality";
import type { DisplayTelemetry } from "../displayTelemetry";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

interface TestDevice {
  _id: string;
  userId: string;
  deviceSn: string;
  isActive: boolean;
  dcInputSource?: DcInputSource;
  mqttLeases?: { collector?: { token: string; expiresAt: number }; temperature?: { token: string; expiresAt: number } };
  displayTelemetry?: DisplayTelemetry;
}
const device: TestDevice = { _id: "owned-device", userId: "owner", deviceSn: "TEST-SERIAL", isActive: true };
const now = 1_700_000_000_000;

function makeContext(stored: TestDevice | null = { ...device }) {
  const patch = vi.fn(async (id: string, fields: Record<string, unknown>) => {
    void id;
    if (stored) Object.assign(stored, fields);
  });
  const withIndex = vi.fn(() => ({ collect: async () => stored ? [stored] : [], first: async () => stored }));
  return {
    db: { get: vi.fn(async () => stored), patch, query: vi.fn(() => ({ withIndex })) },
    runAction: vi.fn(), runMutation: vi.fn(),
  };
}
type TestContext = ReturnType<typeof makeContext>;
function handler<Args, Result>(registered: unknown) {
  return (registered as { _handler: (ctx: TestContext, args: Args) => Promise<Result> })._handler;
}
const change = handler<{ deviceId: string; dcInputSource?: DcInputSource; deviceName?: string }, { success: boolean }>(update);
const getDevice = handler<{ deviceId: string }, { dcInputSource: DcInputSource } | null>(get);
const getSerialDevice = handler<{ deviceSn: string }, { dcInputSource: DcInputSource } | null>(getBySn);
const listDevices = handler<Record<string, never>, Array<{ dcInputSource: DcInputSource }>>(list);

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(auth.getUserId).mockResolvedValue("owner" as Awaited<ReturnType<typeof auth.getUserId>>);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("owned DC source wiring metadata", () => {
  it.each(["auto", "solar", "adapter"] as const)("saves %s as app metadata without controlling the device or changing readings", async (source) => {
    const stored = { ...device, dcInputSource: "adapter" as const };
    const ctx = makeContext(stored);
    expect(await change(ctx, { deviceId: device._id, dcInputSource: source })).toEqual({ success: true });
    expect(ctx.db.patch).toHaveBeenCalledExactlyOnceWith(device._id, { updatedAt: now, dcInputSource: source });
    expect(stored.dcInputSource).toBe(source);
    expect(ctx.db.query).not.toHaveBeenCalled();
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated wiring change before reading or patching a device", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue(null);
    const ctx = makeContext();
    await expect(change(ctx, { deviceId: device._id, dcInputSource: "solar" })).rejects.toThrow("Unauthorized");
    expect(ctx.db.get).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it.each([null, { ...device, userId: "different-owner" }])("refuses missing or unowned devices (%j)", async (stored) => {
    const ctx = makeContext(stored);
    await expect(change(ctx, { deviceId: device._id, dcInputSource: "solar" })).rejects.toThrow("Device not found");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("preserves wiring when updating unrelated app metadata", async () => {
    const stored = { ...device, dcInputSource: "solar" as const };
    const ctx = makeContext(stored);
    await change(ctx, { deviceId: device._id, deviceName: "Updated name" });
    expect(ctx.db.patch).toHaveBeenCalledExactlyOnceWith(device._id, { updatedAt: now, deviceName: "Updated name" });
    expect(stored.dcInputSource).toBe("solar");
  });

  it("maps existing devices to auto without modifying storage, and returns saved wiring in every owned query", async () => {
    const stored = { ...device };
    const before = JSON.stringify(stored);
    const ctx = makeContext(stored);
    expect(await getDevice(ctx, { deviceId: device._id })).toMatchObject({ dcInputSource: "auto" });
    expect(await getSerialDevice(ctx, { deviceSn: device.deviceSn })).toMatchObject({ dcInputSource: "auto" });
    expect(await listDevices(ctx, {})).toMatchObject([{ dcInputSource: "auto" }]);
    expect(JSON.stringify(stored)).toBe(before);
    expect(ctx.db.patch).not.toHaveBeenCalled();
    stored.dcInputSource = "solar";
    expect(await getDevice(ctx, { deviceId: device._id })).toMatchObject({ dcInputSource: "solar" });
    expect(await getSerialDevice(ctx, { deviceSn: device.deviceSn })).toMatchObject({ dcInputSource: "solar" });
    expect(await listDevices(ctx, {})).toMatchObject([{ dcInputSource: "solar" }]);
  });

  it("never exposes internal MQTT lease tokens in public device responses", async () => {
    const ctx = makeContext({ ...device, mqttLeases: { collector: { token: "private-lease-token", expiresAt: now + 90_000 } } });
    const responses = [await getDevice(ctx, { deviceId: device._id }), await getSerialDevice(ctx, { deviceSn: device.deviceSn }), await listDevices(ctx, {})];
    expect(JSON.stringify(responses)).not.toContain("private-lease-token");
    expect(JSON.stringify(responses)).not.toContain("mqttLeases");
  });

  it.each([
    { active: true, expiresAt: now + 90_000, refreshing: true },
    { active: true, expiresAt: now, refreshing: false },
    { active: true, expiresAt: undefined, refreshing: false },
    { active: false, expiresAt: now + 90_000, refreshing: false },
  ])('exposes only owned active thermal progress, without lease details (%j)', async ({ active, expiresAt, refreshing }) => {
    const ctx = makeContext({ ...device, isActive: active, mqttLeases: {
      collector: { token: 'private-collector-token', expiresAt: now + 90_000 },
      ...(expiresAt === undefined ? {} : { temperature: { token: 'private-thermal-token', expiresAt } }),
    } });
    const responses = [await getDevice(ctx, { deviceId: device._id }), await getSerialDevice(ctx, { deviceSn: device.deviceSn })];
    for (const response of responses) expect(response).toMatchObject({ temperatureRefreshing: refreshing });
    expect(await listDevices(ctx, {})).toMatchObject([{ temperatureRefreshing: refreshing }]);
    expect(JSON.stringify([...responses, await listDevices(ctx, {})])).not.toMatch(/private-|mqttLeases|expiresAt/);
    vi.mocked(auth.getUserId).mockResolvedValue('different-owner' as Awaited<ReturnType<typeof auth.getUserId>>);
    expect(await getDevice(ctx, { deviceId: device._id })).toBeNull();
    expect(await getSerialDevice(ctx, { deviceSn: device.deviceSn })).toBeNull();
  });

  it("returns display telemetry separately through owned device projections and preserves auth guards", async () => {
    const displayTelemetry: DisplayTelemetry = { temperature: { value: 39, source: "rest-cache", receivedAt: now } };
    const stored = { ...device, displayTelemetry };
    const before = JSON.stringify(stored);
    const ctx = makeContext(stored);
    expect(await getDevice(ctx, { deviceId: device._id })).toMatchObject({ displayTelemetry });
    expect(await getSerialDevice(ctx, { deviceSn: device.deviceSn })).toMatchObject({ displayTelemetry });
    expect(await listDevices(ctx, {})).toMatchObject([{ displayTelemetry }]);
    expect(JSON.stringify(stored)).toBe(before);
    expect(ctx.db.patch).not.toHaveBeenCalled();
    vi.mocked(auth.getUserId).mockResolvedValue(null);
    expect(await getDevice(ctx, { deviceId: device._id })).toBeNull();
    expect(await getSerialDevice(ctx, { deviceSn: device.deviceSn })).toBeNull();
    expect(await listDevices(ctx, {})).toEqual([]);
    vi.mocked(auth.getUserId).mockResolvedValue("different-owner" as Awaited<ReturnType<typeof auth.getUserId>>);
    expect(await getDevice(ctx, { deviceId: device._id })).toBeNull();
    expect(await getSerialDevice(ctx, { deviceSn: device.deviceSn })).toBeNull();
  });
});
