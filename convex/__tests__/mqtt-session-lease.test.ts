import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimMqttSession, releaseMqttSession } from "../devices_internal";

type Purpose = "collector" | "diagnostic" | "temperature";
type Lease = { token: string; expiresAt: number };
interface StoredDevice {
  isActive: boolean;
  mqttLeases?: Partial<Record<Purpose, Lease>>;
}
interface Args { deviceId: string; purpose: Purpose; token: string }
const now = 1_700_000_000_000;
const deviceId = "test-device";

function makeContext(device: StoredDevice | null = { isActive: true }) {
  return {
    scheduler: { runAfter: vi.fn().mockResolvedValue(null) },
    db: {
      get: vi.fn(async () => device),
      patch: vi.fn(async (id: string, fields: { mqttLeases?: StoredDevice["mqttLeases"] }) => {
        void id;
        if (device) Object.assign(device, fields);
      }),
    },
  };
}
type TestContext = ReturnType<typeof makeContext>;
const claim = (claimMqttSession as unknown as { _handler: (ctx: TestContext, args: Args) => Promise<{ allowed: boolean }> })._handler;
const release = (releaseMqttSession as unknown as { _handler: (ctx: TestContext, args: Args) => Promise<null> })._handler;
const args: Args = { deviceId, purpose: "collector", token: "first-session" };

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(now); });
afterEach(() => { vi.restoreAllMocks(); });

describe("internal MQTT session leases", () => {
  it("claims a server-timed 90-second lease and refuses overlap for the same purpose", async () => {
    const ctx = makeContext();
    expect(await claim(ctx, args)).toEqual({ allowed: true });
    expect(ctx.db.patch).toHaveBeenCalledExactlyOnceWith(deviceId, {
      mqttLeases: { collector: { token: args.token, expiresAt: now + 90_000 } },
    });
    expect(await claim(ctx, { ...args, token: "overlapping-session" })).toEqual({ allowed: false });
    expect(ctx.db.patch).toHaveBeenCalledTimes(1);
  });

  it("keeps diagnostic and collector leases independent", async () => {
    const stored: StoredDevice = { isActive: true };
    const ctx = makeContext(stored);
    await claim(ctx, args);
    expect(await claim(ctx, { ...args, purpose: "diagnostic", token: "diagnostic-session" })).toEqual({ allowed: true });
    expect(stored.mqttLeases).toEqual({
      collector: { token: "first-session", expiresAt: now + 90_000 },
      diagnostic: { token: "diagnostic-session", expiresAt: now + 90_000 },
    });
  });

  it('keeps thermal work independent and schedules a token-matched expiry for reactive progress', async () => {
    const stored: StoredDevice = { isActive: true };
    const ctx = makeContext(stored);
    await claim(ctx, args);
    const thermalArgs: Args = { ...args, purpose: 'temperature', token: 'thermal-session' };
    expect(await claim(ctx, thermalArgs)).toEqual({ allowed: true });
    expect(stored.mqttLeases?.temperature).toEqual({ token: 'thermal-session', expiresAt: now + 360_000 });
    expect(ctx.scheduler.runAfter).toHaveBeenCalledExactlyOnceWith(360_000, expect.anything(), thermalArgs);
    await release(ctx, thermalArgs);
    expect(stored.mqttLeases).toEqual({ collector: { token: args.token, expiresAt: now + 90_000 } });
  });

  it("allows an expired lease to be replaced and ignores a late release from its old token", async () => {
    const stored: StoredDevice = { isActive: true };
    const ctx = makeContext(stored);
    await claim(ctx, args);
    vi.mocked(Date.now).mockReturnValue(now + 90_000);
    expect(await claim(ctx, { ...args, token: "replacement-session" })).toEqual({ allowed: true });
    const beforeRelease = ctx.db.patch.mock.calls.length;
    expect(await release(ctx, args)).toBeNull();
    expect(ctx.db.patch).toHaveBeenCalledTimes(beforeRelease);
    expect(stored.mqttLeases?.collector).toEqual({ token: "replacement-session", expiresAt: now + 180_000 });
  });

  it("releases only the matching purpose and removes empty lease state", async () => {
    const stored: StoredDevice = { isActive: true };
    const ctx = makeContext(stored);
    await claim(ctx, args);
    const diagnosticArgs: Args = { ...args, purpose: "diagnostic", token: "diagnostic-session" };
    await claim(ctx, diagnosticArgs);
    await release(ctx, args);
    expect(stored.mqttLeases).toEqual({ diagnostic: { token: "diagnostic-session", expiresAt: now + 90_000 } });
    await release(ctx, diagnosticArgs);
    expect(stored.mqttLeases).toBeUndefined();
  });

  it.each([null, { isActive: false }])("refuses a missing or inactive device (%j)", async (stored) => {
    const ctx = makeContext(stored);
    await expect(claim(ctx, args)).rejects.toThrow("Device unavailable");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("tolerates release after device removal without writing anything", async () => {
    const ctx = makeContext(null);
    expect(await release(ctx, args)).toBeNull();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
