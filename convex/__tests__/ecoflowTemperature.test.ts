import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { inspect, sanitizeTemperatures, type TemperatureInspection } from "../ecoflowTemperature";
import { generateSignature } from "../ecoflow";
import type { MqttDiagnosticResult } from "../ecoflowMqttDiagnostics";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const now = 1_800_000_000_000;
const device = { _id: "test-device", deviceSn: "TEST-SERIAL", isActive: true };
const quotas = ["bms_bmsStatus.temp", "bms_bmsStatus.minCellTemp", "bms_bmsStatus.maxCellTemp", "bms_bmsStatus.minMosTemp", "bms_bmsStatus.maxMosTemp"];
const capture: MqttDiagnosticResult = {
  reason: "deadline", startedAt: now, finishedAt: now + 20_000,
  connected: true, subscribed: true, receivedMessages: 0, receivedBytes: 0,
  rejectedFrames: 0, duplicateFrames: 0, retainedFrames: 0, liveFrames: 0,
  envelopeCounts: { paramsObject: 0, dataObject: 0, otherObject: 0, nonObject: 0, malformedJson: 0 },
  moduleCounts: { pd: 0, inv: 0, mppt: 0, bms: 0, ems: 0, other: 0 }, frames: [],
};
function context(found: unknown = device) {
  return {
    runQuery: vi.fn().mockResolvedValue(found),
    runAction: vi.fn((reference: FunctionReference<'action', 'internal'>, args: { deviceId: string }) => {
      void reference; void args;
      return new Promise<MqttDiagnosticResult>(resolve => setTimeout(() => resolve(capture), 20_000));
    }),
    runMutation: vi.fn(),
  };
}
const invoke = (inspect as unknown as {
  _handler: (ctx: ReturnType<typeof context>, args: { deviceId: string }) => Promise<TemperatureInspection>;
})._handler;
const fetchMock = vi.fn<typeof fetch>();
function response(data: unknown, code = "0") { return new Response(JSON.stringify({ code, data })); }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("ECOFLOW_ACCESS_KEY", "test-access");
  vi.stubEnv("ECOFLOW_SECRET_KEY", "test-secret");
  fetchMock.mockReset().mockImplementation(async () => response({ "bms_bmsStatus.temp": 32 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("controlled read-only temperature inspection", () => {
  it("starts passive evidence collection, waits five seconds, and signs exactly one fixed selected POST", async () => {
    const ctx = context();
    const pending = invoke(ctx, { deviceId: device._id });
    await vi.advanceTimersByTimeAsync(0);
    expect(getFunctionName(ctx.runAction.mock.calls[0]?.[0] as Parameters<typeof getFunctionName>[0])).toBe("ecoflowMqttDiagnostics:capture");
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-e.ecoflow.com/iot-open/sign/device/quota");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(String(options?.body))).toEqual({ sn: device.deviceSn, params: { quotas } });
    const params: Record<string, string> = { sn: device.deviceSn };
    quotas.forEach((field, index) => { params[`params.quotas[${index}]`] = field; });
    const headers = options?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json;charset=UTF-8");
    expect(headers.sign).toBe(generateSignature("test-secret", "test-access", params, now + 5000, headers.nonce));
    let finished = false;
    void pending.then(() => { finished = true; });
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toEqual({ status: "ok", requestStartedAt: now + 5000, responseReceivedAt: now + 5000,
      httpStatus: 200, apiCode: 0, temperatures: { "bms_bmsStatus.temp": 32 }, captureStatus: "completed", capture });
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(ctx.runAction).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await pending)).not.toMatch(/TEST-SERIAL|test-access|test-secret/);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hard-times out and aborts a stalled selected read without abandoning the passive capture", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const ctx = context();
    const pending = invoke(ctx, { deviceId: device._id });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toMatchObject({ status: "timeout", requestStartedAt: now + 5000, responseReceivedAt: null,
      temperatures: {}, captureStatus: "completed", capture });
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sanitizes both HTTP and capture failures without echoing upstream details", async () => {
    fetchMock.mockRejectedValue(new Error("TEST-SERIAL test-secret private response"));
    const ctx = context();
    ctx.runAction.mockRejectedValue(new Error("TEST-SERIAL MQTT password"));
    const pending = invoke(ctx, { deviceId: device._id });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toMatchObject({ status: "request_failed", temperatures: {}, captureStatus: "failed", capture: null });
    expect(JSON.stringify(await pending)).not.toMatch(/TEST-SERIAL|password|private|test-secret/);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, [], {}, { "bms_bmsStatus.temp": "Infinity" }])("returns no invented temperature for incomplete response data (%j)", async data => {
    fetchMock.mockImplementation(async () => response(data));
    const pending = invoke(context(), { deviceId: device._id });
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await pending).temperatures).toEqual({});
  });

  it.each([
    ['1006', 1006], ['-1', -1], ['--5', null], ['TEST-SERIAL', null], ['1234567890123', null],
  ])('exposes only a safe numeric API code from %s', async (code, expected) => {
    fetchMock.mockImplementation(async () => response({ private: 'TEST-SERIAL' }, code as string));
    const pending = invoke(context(), { deviceId: device._id });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toMatchObject({ status: 'invalid_response', httpStatus: 200, apiCode: expected, temperatures: {} });
    expect(JSON.stringify(await pending)).not.toContain('TEST-SERIAL');
  });

  it('exposes the HTTP failure status without reading or returning its response body', async () => {
    fetchMock.mockImplementation(async () => new Response('private TEST-SERIAL failure', { status: 503 }));
    const pending = invoke(context(), { deviceId: device._id });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toMatchObject({ status: 'request_failed', httpStatus: 503, apiCode: null, temperatures: {} });
    expect(JSON.stringify(await pending)).not.toContain('TEST-SERIAL');
  });

  it.each([null, { ...device, isActive: false }])("rejects missing or inactive devices before external work", async found => {
    const ctx = context(found);
    await expect(invoke(ctx, { deviceId: device._id })).rejects.toThrow("Active device not found");
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires server credentials before capture or selected reading", async () => {
    vi.stubEnv("ECOFLOW_SECRET_KEY", "");
    const ctx = context();
    await expect(invoke(ctx, { deviceId: device._id })).rejects.toThrow("EcoFlow credentials not configured");
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("temperature fields", () => {
  it("preserves distinct BMS sensors and numeric zero while rejecting arbitrary payloads", () => {
    expect(sanitizeTemperatures({ "bms_bmsStatus.temp": "32", "bms_bmsStatus.minCellTemp": 0,
      "bms_bmsStatus.maxCellTemp": 33, "bms_bmsStatus.minMosTemp": -1, "bms_bmsStatus.maxMosTemp": 34,
      serial: "TEST-SERIAL", password: "secret", nested: { temp: 90 } })).toEqual({
      "bms_bmsStatus.temp": 32, "bms_bmsStatus.minCellTemp": 0, "bms_bmsStatus.maxCellTemp": 33,
      "bms_bmsStatus.minMosTemp": -1, "bms_bmsStatus.maxMosTemp": 34,
    });
    expect(sanitizeTemperatures({ "bms_bmsStatus.temp": NaN, "bms_bmsStatus.minCellTemp": Infinity,
      "bms_bmsStatus.maxCellTemp": null, "bms_bmsStatus.minMosTemp": true, "bms_bmsStatus.maxMosTemp": " " })).toEqual({});
  });
});
