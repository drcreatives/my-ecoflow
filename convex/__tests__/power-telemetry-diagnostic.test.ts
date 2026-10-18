import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { inspectPowerTelemetry } from "../ecoflow";

const now = 1_700_000_000_000;
const device = { _id: "test-device-id", deviceSn: "TEST-SERIAL", isActive: true };
const fetchMock = vi.fn<typeof fetch>();

function makeContext(foundDevice: typeof device | null = device) {
  return {
    runQuery: vi.fn(async (reference: FunctionReference<"query", "internal">, args: unknown) => {
      void reference;
      void args;
      return foundDevice;
    }),
    runMutation: vi.fn(),
    runAction: vi.fn(),
    scheduler: { runAfter: vi.fn(), runAt: vi.fn() },
  };
}

type TestContext = ReturnType<typeof makeContext>;
interface DiagnosticResult {
  online: boolean;
  requestedAt: number;
  receivedAt: number;
  fields: Record<string, number>;
}
const inspect = (inspectPowerTelemetry as unknown as {
  _handler: (ctx: TestContext, args: { deviceId: string }) => Promise<DiagnosticResult>;
})._handler;

function response(data: unknown, code = "0", message = "Success") {
  return new Response(JSON.stringify({ code, message, data }), { status: 200 });
}

function mockTelemetry(telemetry: unknown, online = true) {
  fetchMock.mockImplementation(async (input) => {
    if (String(input).endsWith("/device/list")) {
      return response([{ sn: device.deviceSn, online: online ? 1 : 0 }]);
    }
    vi.mocked(Date.now).mockReturnValue(now + 100);
    return response(telemetry);
  });
}

function expectReadOnly(ctx: TestContext) {
  expect(ctx.runMutation).not.toHaveBeenCalled();
  expect(ctx.runAction).not.toHaveBeenCalled();
  expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  expect(ctx.scheduler.runAt).not.toHaveBeenCalled();
  for (const [, options] of fetchMock.mock.calls) expect(options?.method).toBe("GET");
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("ECOFLOW_ACCESS_KEY", "test-access-key");
  vi.stubEnv("ECOFLOW_SECRET_KEY", "test-secret-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("read-only internal power telemetry diagnostic", () => {
  it("reads one device and uses only bounded GETs without saving readings or health", async () => {
    mockTelemetry({ "pd.wattsInSum": 85, "inv.inputWatts": 99, "mppt.inWatts": 0 });
    const ctx = makeContext();

    expect(await inspect(ctx, { deviceId: device._id })).toEqual({
      online: true, requestedAt: now, receivedAt: now + 100,
      fields: { "pd.wattsInSum": 85, "inv.inputWatts": 99, "mppt.inWatts": 0 },
    });
    expect(ctx.runQuery).toHaveBeenCalledTimes(1);
    expect(getFunctionName(ctx.runQuery.mock.calls[0][0])).toBe("devices_internal:getById");
    expect(ctx.runQuery.mock.calls[0][1]).toEqual({ deviceId: device._id });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api-e.ecoflow.com/iot-open/sign/device/list");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/device/quota/all?sn=");
    expectReadOnly(ctx);
  });

  it("returns offline without requesting cached quota or changing stored status", async () => {
    mockTelemetry({ "inv.inputWatts": 99 }, false);
    const ctx = makeContext();
    expect(await inspect(ctx, { deviceId: device._id })).toEqual({
      online: false, requestedAt: now, receivedAt: now, fields: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectReadOnly(ctx);
  });

  it.each([null, { ...device, isActive: false }])("refuses a missing or inactive device before the network (%j)", async (found) => {
    const ctx = makeContext(found);
    await expect(inspect(ctx, { deviceId: device._id })).rejects.toThrow("Device unavailable");
    expect(fetchMock).not.toHaveBeenCalled();
    expectReadOnly(ctx);
  });

  it("requires backend credentials before making a network request", async () => {
    vi.stubEnv("ECOFLOW_SECRET_KEY", "");
    const ctx = makeContext();
    await expect(inspect(ctx, { deviceId: device._id })).rejects.toThrow("EcoFlow API credentials not configured");
    expect(fetchMock).not.toHaveBeenCalled();
    expectReadOnly(ctx);
  });

  it("returns only allowlisted finite numeric scalars, preserving zero and signed current", async () => {
    mockTelemetry({
      "pd.wattsInSum": "85", "pd.chgPowerAC": "1234", "pd.chgSunPower": "0",
      "pd.chgPowerDC": 4, "pd.chargerType": "255", "pd.acChargeFlag": 1,
      "pd.redunChargeFlag": 0, "inv.chargerType": "1", "inv.acInVol": 230000,
      "mppt.x60ChgType": 1, "bms_bmsStatus.amp": "-2000",
      "pd.soc": "", "mppt.inWatts": "Infinity", "inv.outputWatts": "99 watts",
      "inv.dcInVol": null, "inv.dcInAmp": { value: 3 }, "mppt.chgState": false,
      deviceSn: device.deviceSn, deviceId: device._id, accessKey: "test-access-key",
      secretKey: "test-secret-key", "pd.serialNumber": "TEST-SERIAL", rawData: { private: true },
      unexpectedNumericField: 123,
    });
    const ctx = makeContext();
    const result = await inspect(ctx, { deviceId: device._id });
    expect(result.fields).toEqual({
      "pd.wattsInSum": 85, "pd.chgPowerAC": 1234, "pd.chgSunPower": 0, "pd.chgPowerDC": 4,
      "pd.chargerType": 255, "pd.acChargeFlag": 1, "pd.redunChargeFlag": 0,
      "inv.chargerType": 1, "inv.acInVol": 230000, "mppt.x60ChgType": 1, "bms_bmsStatus.amp": -2000,
    });
    const serialized = JSON.stringify(result);
    for (const privateValue of [device.deviceSn, device._id, "test-access-key", "test-secret-key", "rawData"]) {
      expect(serialized).not.toContain(privateValue);
    }
    expectReadOnly(ctx);
  });

  it("sanitizes an upstream error instead of returning echoed serials or credentials", async () => {
    fetchMock.mockResolvedValue(response({}, "5000", "TEST-SERIAL test-access-key test-secret-key"));
    const ctx = makeContext();
    await expect(inspect(ctx, { deviceId: device._id })).rejects.toThrow("EcoFlow API returned an unsuccessful response");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expectReadOnly(ctx);
  });
});
