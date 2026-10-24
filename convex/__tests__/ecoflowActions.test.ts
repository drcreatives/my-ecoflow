import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { auth } from "../auth";
import { collectAllUserReadings, generateSignature, refreshDeviceReading, refreshReadings } from "../ecoflow";
import { captureReadingInProcess, type DiagnosticFrame, type MqttDiagnosticResult } from "../ecoflowMqttDiagnostics";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));
vi.mock("../ecoflowMqttDiagnostics", () => ({ captureReadingInProcess: vi.fn() }));

const captureReadingMock = vi.mocked(captureReadingInProcess);

const now = 1_700_000_000_000;
const device = { _id: "device-one", userId: "user-one", deviceSn: "TEST-DEVICE-ONE", isActive: true };
const secondDevice = { ...device, _id: "device-two", deviceSn: "TEST-DEVICE-TWO" };
const quota = {
  "bms_bmsStatus.soc": 50,
  "pd.model": 80,
  "pd.sysVer": 16908850,
  "pd.inputWatts": 400,
  "pd.chargerType": 0,
  "pd.wattsInSum": 400,
  "pd.wattsOutSum": 100,
  "inv.inputWatts": 400,
  "mppt.inWatts": 0,
  "mppt.chgType": 3,
};

type Reference = FunctionReference<"query" | "mutation" | "action", "internal">;
function name(reference: Reference) { return getFunctionName(reference); }
let liveQuota: unknown = quota;

function liveResult(telemetry: unknown = liveQuota, receivedAt = Date.now()): MqttDiagnosticResult {
  const fields: Record<string, number> = {};
  if (telemetry && typeof telemetry === "object") {
    for (const [key, value] of Object.entries(telemetry)) {
      const numeric = typeof value === "string" ? Number(value) : value;
      if (key.startsWith("pd.") && typeof numeric === "number" && Number.isFinite(numeric)) fields[key.slice(3)] = numeric;
    }
    const soc = (telemetry as Record<string, unknown>)["bms_bmsStatus.soc"];
    if (typeof soc === "number" && Number.isFinite(soc)) fields.soc = soc;
  }
  const ready = ["wattsInSum", "wattsOutSum"].every((key) => Number.isFinite(fields[key]) && fields[key] >= 0);
  const frame = (moduleTime: number): DiagnosticFrame => ({
    module: "pd", moduleTime, id: moduleTime, receivedAt,
    retained: false, duplicate: false, values: { ...fields },
  });
  return {
    reason: ready ? "measurement_ready" : "deadline", startedAt: receivedAt, finishedAt: receivedAt,
    connected: true, subscribed: true, receivedMessages: 2, receivedBytes: 100,
    rejectedFrames: 0, duplicateFrames: 0, retainedFrames: 0, liveFrames: 2,
    envelopeCounts: { paramsObject: 2, dataObject: 0, otherObject: 0, nonObject: 0, malformedJson: 0 },
    moduleCounts: { pd: 2, inv: 0, mppt: 0, bms: 0, ems: 0, other: 0 }, frames: [frame(1), frame(2)],
  };
}

function makeContext(devices: Array<typeof device & { dcInputSource?: "auto" | "solar" | "adapter" }> = [device]) {
  return {
    scheduler: { runAfter: vi.fn().mockResolvedValue(null) },
    runQuery: vi.fn(async (reference: Reference) => {
      switch (name(reference)) {
        case "devices_internal:listByUserId": return devices;
        case "devices_internal:getById": return devices[0] ?? null;
        case "settings:getCollectionSettingsForDevices": return [{ userId: "user-one", collectionIntervalMinutes: 5, lastCollectionAt: 0 }];
        default: throw new Error(`Unexpected query: ${name(reference)}`);
      }
    }),
    runMutation: vi.fn(async (reference: Reference, args?: Record<string, unknown>) => {
      void args;
      if (name(reference) === "readings:claimRefreshAttempt") return { allowed: true, reason: "allowed", retryAfterMs: 0 };
      return null;
    }),
    runAction: vi.fn(async () => { throw new Error("Unexpected nested action"); }),
  };
}

type TestContext = ReturnType<typeof makeContext>;
function handler<Args, Result>(registered: unknown) {
  return (registered as { _handler: (ctx: TestContext, args: Args) => Promise<Result> })._handler;
}
interface RefreshResult {
  success: boolean;
  devicesRefreshed: number;
  devicesSkipped: number;
  devicesFresh: number;
  devicesRateLimited: number;
  devicesOffline: number;
  devicesFailed: number;
  retryAfterMs: number;
}
const refresh = handler<{ deviceId?: string; force?: boolean }, RefreshResult>(refreshReadings);
const collect = handler<Record<string, never>, {
  success: boolean; totalReadings?: number; usersCollected?: number;
  devicesOffline?: number; devicesFailed?: number;
}>(collectAllUserReadings);
const refreshAfterSet = handler<{ deviceId: string; deviceSn: string }, { success: boolean; status?: string }>(refreshDeviceReading);

function response(data: unknown, code = "0") {
  return new Response(JSON.stringify({ code, message: "test response", data }), { status: 200 });
}

const fetchMock = vi.fn<typeof fetch>();
function mockTelemetry(online = [device, secondDevice], telemetry: unknown = quota) {
  liveQuota = telemetry;
  fetchMock.mockImplementation(async (input) => {
    const url = String(input);
    if (url.endsWith("/device/list")) return response(online.map((item) => ({ sn: item.deviceSn, online: 1 })));
    return response(telemetry);
  });
}

function mutationCalls(ctx: TestContext, mutation: string) {
  return ctx.runMutation.mock.calls.filter(([reference]) => name(reference) === mutation);
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(auth.getUserId).mockResolvedValue("user-one" as Awaited<ReturnType<typeof auth.getUserId>>);
  vi.stubEnv("ECOFLOW_ACCESS_KEY", "test-access");
  vi.stubEnv("ECOFLOW_SECRET_KEY", "test-secret");
  vi.stubEnv("DISABLE_CRONS", "false");
  vi.stubEnv("TEMPERATURE_COLLECTION_ENABLED", "true");
  fetchMock.mockReset();
  captureReadingMock.mockReset().mockImplementation(async () => liveResult());
  vi.stubGlobal("fetch", fetchMock);
  mockTelemetry();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("on-demand EcoFlow collection", () => {
  it.each(["manual", "cron", "afterSet"] as const)("keeps %s power collection running while temperature is paused", async (path) => {
    vi.stubEnv("TEMPERATURE_COLLECTION_ENABLED", undefined);
    const ctx = makeContext();
    const result = path === "manual" ? await refresh(ctx, { force: true })
      : path === "cron" ? await collect(ctx, {})
        : await refreshAfterSet(ctx, { deviceId: device._id, deviceSn: device.deviceSn });
    expect(result).toMatchObject({ success: true });
    expect(captureReadingMock).toHaveBeenCalledExactlyOnceWith(ctx, device._id);
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(1);
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({ powerMeasurement: "pd-totals-mqtt-v1" });
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it.each(["manual", "cron", "afterSet"] as const)("captures %s power in the caller without starting a second action", async (path) => {
    const ctx = makeContext();
    const capturedAt = now + 2_000;
    captureReadingMock.mockResolvedValue(liveResult(quota, capturedAt));

    const result = path === "manual" ? await refresh(ctx, { force: true })
      : path === "cron" ? await collect(ctx, {})
        : await refreshAfterSet(ctx, { deviceId: device._id, deviceSn: device.deviceSn });

    expect(result).toMatchObject({ success: true });
    expect(captureReadingMock).toHaveBeenCalledExactlyOnceWith(ctx, device._id);
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(1);
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 400, outputWatts: 100, recordedAt: capturedAt,
      powerMeasurement: "pd-totals-mqtt-v1", inputMeasurement: "delta2-pd-mqtt-v1",
    });
    expect(ctx.scheduler.runAfter).toHaveBeenCalledExactlyOnceWith(0, expect.anything(), { deviceId: device._id });
    expect(getFunctionName(ctx.scheduler.runAfter.mock.calls[0][1] as Reference)).toBe("ecoflowMqttDiagnostics:captureTemperature");
  });

  it.each(["manual", "cron", "afterSet"] as const)("preserves %s collection failure handling when the in-process capture rejects", async (path) => {
    const ctx = makeContext();
    captureReadingMock.mockRejectedValue(new Error("Private upstream MQTT failure"));
    const result = path === "manual" ? await refresh(ctx, { force: true })
      : path === "cron" ? await collect(ctx, {})
        : await refreshAfterSet(ctx, { deviceId: device._id, deviceSn: device.deviceSn });

    expect(result).toMatchObject({ success: false });
    expect(JSON.stringify(result)).not.toContain("Private upstream");
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
    expect(mutationCalls(ctx, "settings:updateLastCollection")).toHaveLength(0);
    expect(mutationCalls(ctx, "readings:recordCollectionStatus")[0]?.[1]).toMatchObject({ status: "error" });
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthenticated requests before any database/network work", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue(null);
    const ctx = makeContext();
    await expect(refresh(ctx, {})).rejects.toThrow("Unauthorized");
    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects another user's device before claiming a refresh or fetching", async () => {
    const ctx = makeContext([{ ...device, userId: "other-user" }]);
    await expect(refresh(ctx, { deviceId: device._id })).rejects.toThrow("Device not found or not owned by user");
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["fresh", "rate_limited"])("reports a %s skip without a network request", async (reason) => {
    const ctx = makeContext();
    ctx.runMutation.mockResolvedValue({ allowed: false, reason, retryAfterMs: 45_000 });
    const result = await refresh(ctx, {});
    expect(result).toMatchObject({ success: true, devicesRefreshed: 0, devicesSkipped: 1, retryAfterMs: 45_000 });
    expect(result[reason === "fresh" ? "devicesFresh" : "devicesRateLimited"]).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes explicit force to the atomic attempt guard and stores quality without raw telemetry", async () => {
    const ctx = makeContext();
    expect(await refresh(ctx, { deviceId: device._id, force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    expect(mutationCalls(ctx, "readings:claimRefreshAttempt")[0]?.[1]).toEqual({ deviceId: device._id, force: true });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({ inputQuality: "consistent", inputWatts: 400, acInputWatts: 400 });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).not.toHaveProperty("rawData");
    expect(mutationCalls(ctx, "readings:recordCollectionStatus")[0]?.[1]).toMatchObject({ status: "online" });
  });

  it("persists the model 80 same-PD source channels and measurement provenance", async () => {
    mockTelemetry([device], { ...quota, "pd.model": 80, "pd.sysVer": 16908850, "pd.inputWatts": 104, "pd.wattsInSum": 104,
      "pd.chargerType": 0, "inv.inputWatts": 134, "mppt.inWatts": 378, "mppt.chgType": 2 });
    const ctx = makeContext();
    await refresh(ctx, { force: true });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 104, acInputWatts: 104, dcInputWatts: 0,
      inputQuality: "consistent", inputMeasurement: "delta2-pd-mqtt-v1", chargingType: 3,
    });
  });

  it("replaces frozen REST power, source flags, and SOC with the live PD receipt", async () => {
    mockTelemetry([device], { ...quota, "pd.wattsInSum": 110, "pd.inputWatts": 110,
      "pd.wattsOutSum": 172, "pd.chargerType": 255, "bms_bmsStatus.soc": 100,
      "bms_bmsStatus.temp": 99, "bms_emsStatus.chgRemainTime": 999 });
    const ctx = makeContext();
    captureReadingMock.mockResolvedValue(liveResult({
      ...quota, "pd.wattsInSum": 98, "pd.inputWatts": 0, "pd.wattsOutSum": 158,
      "pd.chargerType": 2, "pd.soc": 76, "bms_bmsStatus.soc": 76, "pd.remainTime": -90,
    }, now + 2_000));
    await refresh(ctx, { force: true });
    expect(captureReadingMock).toHaveBeenCalledWith(ctx, device._id);
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 98, outputWatts: 158, acInputWatts: 0, dcInputWatts: 98,
      solarInputWatts: 98, chargingType: 2, batteryLevel: 76, remainingTime: -90,
      temperature: undefined, acOutputWatts: undefined, inputMeasurement: "delta2-pd-mqtt-v1",
      recordedAt: now + 2_000,
    });
    expect(mutationCalls(ctx, "readings:recordCollectionStatus")[0]?.[1]).toMatchObject({
      status: "online", checkedAt: now + 2_000,
    });
    expect(mutationCalls(ctx, "devices_internal:recordDisplayTelemetry")
      .every(([, args]) => !Object.prototype.hasOwnProperty.call(args?.telemetry ?? {}, "temperature"))).toBe(true);
  });

  it("stores live output splits without turning an initial BMS temperature into a PD-timed sample", async () => {
    mockTelemetry([device], { ...quota, "bms_bmsStatus.temp": 99, "inv.outputWatts": 300 });
    const result = liveResult({ ...quota, "pd.wattsOutSum": 159, "pd.outputWatts": 92, "pd.carWatts": 62 }, now + 2_000);
    result.startedAt = now;
    result.frames.unshift({ ...result.frames[0], module: "bms", moduleTime: 50,
      receivedAt: now + 1_000, values: { temp: 37 } });
    const ctx = makeContext();
    captureReadingMock.mockResolvedValue(result);
    await refresh(ctx, { force: true });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      temperature: undefined, acOutputWatts: 92, dcOutputWatts: 62, usbOutputWatts: 5, recordedAt: now + 2_000,
    });
    expect(mutationCalls(ctx, "devices_internal:recordDisplayTelemetry")[0]?.[1]).toMatchObject({
      telemetry: {
        acOutputWatts: { value: 92, source: "mqtt", receivedAt: now + 2_000 },
        usbOutputWatts: { value: 5, source: "mqtt", receivedAt: now + 2_000 },
      },
    });
    expect((mutationCalls(ctx, "devices_internal:recordDisplayTelemetry")[0]?.[1]?.telemetry as Record<string, unknown>))
      .not.toHaveProperty("temperature");
  });

  it("keeps a valid live capture successful if the supplemental display cache cannot be updated", async () => {
    mockTelemetry([device], { ...quota, "bms_bmsStatus.temp": 39, "pd.outputWatts": 100 });
    const ctx = makeContext();
    const original = ctx.runMutation.getMockImplementation()!;
    ctx.runMutation.mockImplementation(async (reference, args) => {
      if (name(reference) === "devices_internal:recordDisplayTelemetry") throw new Error("Cache write failed");
      return original(reference, args);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(1);
    expect(mutationCalls(ctx, "readings:recordCollectionStatus")[0]?.[1]).toMatchObject({ status: "online" });
    expect(warn).toHaveBeenCalledWith("EcoFlow display telemetry cache could not be updated");
  });

  it.each(["manual", "cron", "afterSet"])("schedules independent temperature work for an online %s capture", async path => {
    const ctx = makeContext();
    if (path === "manual") await refresh(ctx, { force: true });
    else if (path === "cron") await collect(ctx, {});
    else await refreshAfterSet(ctx, { deviceId: device._id, deviceSn: device.deviceSn });
    expect(ctx.scheduler.runAfter).toHaveBeenCalledExactlyOnceWith(0, expect.anything(), { deviceId: device._id });
    expect(getFunctionName(ctx.scheduler.runAfter.mock.calls[0][1] as Reference)).toBe("ecoflowMqttDiagnostics:captureTemperature");
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 400, acInputWatts: 400, dcInputWatts: 0, inputMeasurement: "delta2-pd-mqtt-v1",
    });
  });

  it('keeps a thermal scheduling failure independent of successful power/source history and health', async () => {
    const ctx = makeContext();
    ctx.scheduler.runAfter.mockRejectedValue(new Error('scheduler unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    expect(mutationCalls(ctx, 'readings:insertReading')[0]?.[1]).toMatchObject({ inputWatts: 400, acInputWatts: 400 });
    expect(mutationCalls(ctx, 'readings:recordCollectionStatus')[0]?.[1]).toMatchObject({ status: 'online' });
    expect(warn).toHaveBeenCalledWith('EcoFlow temperature capture could not be scheduled');
  });

  it.each(["manual", "cron", "afterSet"])("skips a busy %s capture without corrupting health or inserting cached data", async (path) => {
    const ctx = makeContext();
    captureReadingMock.mockResolvedValue({ ...liveResult(), reason: "capture_busy", frames: [], liveFrames: 0 });
    const result = path === "manual" ? await refresh(ctx, { force: true })
      : path === "cron" ? await collect(ctx, {})
        : await refreshAfterSet(ctx, { deviceId: device._id, deviceSn: device.deviceSn });
    expect(result).toMatchObject({ success: true });
    if (path === "manual") expect(result).toMatchObject({ devicesRefreshed: 0, devicesSkipped: 1, devicesBusy: 1, devicesFailed: 0 });
    if (path === "cron") expect(result).toMatchObject({ totalReadings: 0, devicesBusy: 1, devicesFailed: 0 });
    if (path === "afterSet") expect(result).toMatchObject({ status: "busy" });
    expect(mutationCalls(ctx, "readings:recordCollectionStatus")).toHaveLength(0);
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["deadline", "retained", "duplicate", "replay", "partial", "newer_partial", "no_pd", "one_frame"])(
    "does not insert a cached reading when fresh PD evidence is %s", async (failure) => {
      const result = liveResult();
      if (failure === "deadline") result.reason = "deadline";
      if (failure === "retained") result.frames = result.frames.map((frame) => ({ ...frame, retained: true }));
      if (failure === "duplicate") result.frames = result.frames.map((frame) => ({ ...frame, duplicate: true }));
      if (failure === "replay") result.frames[1].moduleTime = result.frames[0].moduleTime;
      if (failure === "partial") delete result.frames[1].values.wattsOutSum;
      if (failure === "newer_partial") result.frames.push({ ...result.frames[1], moduleTime: 3, values: { inputWatts: 0 } });
      if (failure === "no_pd") result.frames = [];
      if (failure === "one_frame") result.frames = result.frames.slice(0, 1);
      const ctx = makeContext();
      captureReadingMock.mockResolvedValue(result);
      expect(await refresh(ctx, { force: true })).toMatchObject({ success: false, devicesFailed: 1, devicesRefreshed: 0 });
      expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
      expect(ctx.runMutation.mock.calls.every(([reference]) => ["readings:claimRefreshAttempt", "readings:recordCollectionStatus"].includes(name(reference)))).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["model", "sysVer", "chargerType", "both"])("uses static identity configuration when live %s is absent", async (missing) => {
    const ctx = makeContext();
    const result = liveResult();
    for (const frame of result.frames) {
      if (missing === "model" || missing === "both") delete frame.values.model;
      if (missing === "sysVer" || missing === "both") delete frame.values.sysVer;
      if (missing === "chargerType") delete frame.values.chargerType;
    }
    captureReadingMock.mockResolvedValue(result);
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 400, acInputWatts: 400, dcInputWatts: 0, solarInputWatts: 0,
      inputQuality: "consistent", inputMeasurement: "delta2-pd-mqtt-v1", chargingType: 3,
    });
  });

  it("lets live firmware override supported cached firmware without inventing a source", async () => {
    const ctx = makeContext();
    captureReadingMock.mockResolvedValue(liveResult({ ...quota, "pd.sysVer": 16908851 }));
    await refresh(ctx, { force: true });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 400, inputQuality: "incomplete", inputMeasurement: undefined, chargingType: undefined,
    });
  });

  it("uses configured direct solar wiring when delta reports omit source flags", async () => {
    const configured = { ...device, dcInputSource: "solar" as const };
    const ctx = makeContext([configured]);
    captureReadingMock.mockResolvedValue(liveResult({ "pd.wattsInSum": 486, "pd.inputWatts": 0, "pd.wattsOutSum": 158 }));
    await refresh(ctx, { force: true });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 486, acInputWatts: 0, dcInputWatts: 486, solarInputWatts: 486,
      inputQuality: "consistent", chargingType: 2, chargingTypeSource: "device-setting",
      inputMeasurement: "delta2-pd-mqtt-v1", batteryLevel: undefined,
    });
  });

  it.each(["manual", "cron", "afterSet"])("records live total power/SOC through %s when PD omits AC without inventing source allocation", async (path) => {
    const configured = { ...device, dcInputSource: "solar" as const };
    const ctx = makeContext([configured]);
    const live = liveResult({ "pd.wattsInSum": 228, "pd.wattsOutSum": 217, "pd.soc": 76 });
    captureReadingMock.mockResolvedValue(live);
    const result = path === "manual" ? await refresh(ctx, { force: true })
      : path === "cron" ? await collect(ctx, {})
        : await refreshAfterSet(ctx, { deviceId: configured._id, deviceSn: configured.deviceSn });
    expect(result).toMatchObject({ success: true });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 228, outputWatts: 217, batteryLevel: 76, recordedAt: live.finishedAt,
      acInputWatts: undefined, dcInputWatts: undefined, solarInputWatts: undefined,
      inputQuality: "incomplete", inputMeasurement: undefined, chargingType: undefined, chargingTypeSource: undefined,
      powerMeasurement: "pd-totals-mqtt-v1",
    });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).not.toHaveProperty("solarPanelMeasurement");
    expect(mutationCalls(ctx, "readings:recordCollectionStatus")[0]?.[1]).toMatchObject({ status: "online" });
  });

  it("does not carry an earlier packet's AC value into a newer totals-only report", async () => {
    const ctx = makeContext([{ ...device, dcInputSource: "solar" as const }]);
    const live = liveResult();
    live.frames[1].values = { wattsInSum: 228, wattsOutSum: 217, soc: 76 };
    captureReadingMock.mockResolvedValue(live);
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 228, outputWatts: 217, batteryLevel: 76,
      acInputWatts: undefined, dcInputWatts: undefined, solarInputWatts: undefined,
      inputQuality: "incomplete", inputMeasurement: undefined,
    });
  });

  it("preserves the accepted total packet and receipt when only SOC metadata advances during grace", async () => {
    const ctx = makeContext();
    const live = liveResult({ "pd.wattsInSum": 228, "pd.wattsOutSum": 217 });
    live.finishedAt = now + 1_000;
    live.frames.push({ ...live.frames[1], moduleTime: 3, receivedAt: live.finishedAt, values: { soc: 77, remainTime: 20 } });
    captureReadingMock.mockResolvedValue(live);
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 228, outputWatts: 217, batteryLevel: 77, recordedAt: now,
      acInputWatts: undefined, dcInputWatts: undefined, solarInputWatts: undefined,
      inputQuality: "incomplete", inputMeasurement: undefined, powerMeasurement: "pd-totals-mqtt-v1",
    });
  });

  it("records explicit same-session MPPT solar-panel power independently without subtracting or clamping it to PD totals", async () => {
    const ctx = makeContext([{ ...device, dcInputSource: "solar" as const }]);
    const live = liveResult({ "pd.wattsInSum": 221, "pd.wattsOutSum": 217 });
    live.finishedAt = now + 2_000;
    live.frames[1].receivedAt = now + 1_000;
    live.frames.splice(1, 0, { ...live.frames[0], module: "mppt", moduleTime: 10, values: { inWatts: 230, chgType: 2 } });
    live.frames.push({ ...live.frames[0], module: "mppt", moduleTime: 11, receivedAt: live.finishedAt, values: { inWatts: 231, chgType: 2 } });
    captureReadingMock.mockResolvedValue(live);
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 221, outputWatts: 217, recordedAt: now + 1_000, powerMeasurement: "pd-totals-mqtt-v1",
      acInputWatts: undefined, dcInputWatts: undefined, solarInputWatts: undefined, inputMeasurement: undefined,
      inputQuality: "incomplete", chargingType: undefined,
      solarPanelInputWatts: 231, solarPanelReceivedAt: now + 2_000, solarPanelMeasurement: "delta2-mppt-mqtt-v1",
    });
  });

  it("keeps valid live totals but suppresses panel provenance for an unsupported live firmware", async () => {
    const ctx = makeContext();
    const live = liveResult({ "pd.wattsInSum": 221, "pd.wattsOutSum": 217, "pd.model": 80, "pd.sysVer": 16908851 });
    live.frames.push(
      { ...live.frames[0], module: "mppt", moduleTime: 10, values: { inWatts: 230, chgType: 2 } },
      { ...live.frames[0], module: "mppt", moduleTime: 11, values: { inWatts: 231, chgType: 2 } },
    );
    captureReadingMock.mockResolvedValue(live);
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    const inserted = mutationCalls(ctx, "readings:insertReading")[0]?.[1];
    expect(inserted).toMatchObject({ inputWatts: 221, outputWatts: 217, inputMeasurement: undefined, powerMeasurement: "pd-totals-mqtt-v1" });
    expect(inserted).not.toHaveProperty("solarPanelMeasurement");
    expect(inserted).not.toHaveProperty("solarPanelInputWatts");
  });

  it.each(["retained", "duplicate", "replay", "reset_after_ready", "metadata_reset_after_ready", "empty_reset_after_ready", "replay_after_ready", "negative_clock", "before_session", "after_session"])("rejects %s totals-only evidence without accepting cached REST sources", async failure => {
    const ctx = makeContext();
    const live = liveResult({ "pd.wattsInSum": 228, "pd.wattsOutSum": 217, "pd.soc": 76 });
    if (failure === "retained") live.frames = live.frames.map(frame => ({ ...frame, retained: true }));
    if (failure === "duplicate") live.frames = live.frames.map(frame => ({ ...frame, duplicate: true }));
    if (failure === "replay") live.frames[1].moduleTime = live.frames[0].moduleTime;
    if (failure === "negative_clock") live.frames.forEach((frame, index) => { frame.moduleTime = index - 2; });
    if (failure === "reset_after_ready" || failure === "replay_after_ready") live.frames.push({
      ...live.frames[1], id: 999, moduleTime: failure === "reset_after_ready" ? 0 : 2,
      values: { wattsInSum: 99, wattsOutSum: 98 },
    });
    if (failure === "metadata_reset_after_ready" || failure === "empty_reset_after_ready") live.frames.push({
      ...live.frames[1], id: 999, moduleTime: 0, values: failure === "metadata_reset_after_ready" ? { soc: 77 } : {},
    });
    if (failure === "before_session") live.frames = live.frames.map(frame => ({ ...frame, receivedAt: live.startedAt - 1 }));
    if (failure === "after_session") live.frames = live.frames.map(frame => ({ ...frame, receivedAt: live.finishedAt + 1 }));
    captureReadingMock.mockResolvedValue(live);
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: false, devicesRefreshed: 0, devicesFailed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["lower_metadata", "lower_empty", "equal_power"])("never reuses pre-break PD proof after %s and a later full packet", async kind => {
    const ctx = makeContext();
    const live = liveResult({ "pd.wattsInSum": 228, "pd.wattsOutSum": 217 });
    live.frames.push(
      { ...live.frames[1], id: 999, moduleTime: kind === "equal_power" ? 2 : 0,
        values: kind === "lower_metadata" ? { soc: 77 } : kind === "lower_empty" ? {} : { inputWatts: 0 } },
      { ...live.frames[1], id: 1000, moduleTime: 3,
        values: { wattsInSum: 105, inputWatts: 105, wattsOutSum: 160, model: 80, sysVer: 16908850 } },
    );
    captureReadingMock.mockResolvedValue(live);
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: false, devicesRefreshed: 0, devicesFailed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses progressing same-session PD metadata and the latest complete packet's powers", async () => {
    const result = liveResult({ "pd.wattsInSum": 98, "pd.inputWatts": 0, "pd.wattsOutSum": 158 });
    result.frames = [
      { ...result.frames[0], moduleTime: 1, values: { model: 80, sysVer: 16908850, chargerType: 2, soc: 76 } },
      { ...result.frames[0], moduleTime: 2 },
      { ...result.frames[1], moduleTime: 3, values: { wattsInSum: 105, inputWatts: 0, wattsOutSum: 150 } },
    ];
    const ctx = makeContext();
    captureReadingMock.mockResolvedValue(result);
    await refresh(ctx, { force: true });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 105, outputWatts: 150, solarInputWatts: 105, chargingType: 2,
      batteryLevel: 76, inputMeasurement: "delta2-pd-mqtt-v1",
    });
  });

  it("excludes retained PD metadata from source classification", async () => {
    const result = liveResult({ "pd.wattsInSum": 98, "pd.inputWatts": 0, "pd.wattsOutSum": 158 });
    result.frames.unshift({ ...result.frames[0], moduleTime: 0, retained: true, values: { model: 80, sysVer: 16908850, chargerType: 2 } });
    const ctx = makeContext();
    captureReadingMock.mockResolvedValue(result);
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 98, acInputWatts: 0, dcInputWatts: 98, inputQuality: "consistent",
      chargingType: undefined, chargingTypeSource: undefined, solarInputWatts: undefined,
    });
  });

  it("preserves BMS/EMS nonthermal fields without recording their temperature on the PD clock", async () => {
    const result = liveResult({ ...quota, "pd.soc": 76, "bms_bmsStatus.soc": 76, "pd.remainTime": 100 });
    result.frames.splice(1, 0,
      { ...result.frames[0], module: "bms", moduleTime: 50, values: { temp: 24, soc: 75 } },
      { ...result.frames[0], module: "ems", moduleTime: 500, values: { chgRemainTime: 90, dsgRemainTime: 200 } },
      { ...result.frames[0], module: "bms", moduleTime: 49, values: { temp: 99, soc: 100 } },
    );
    const ctx = makeContext();
    captureReadingMock.mockResolvedValue(result);
    await refresh(ctx, { force: true });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({ batteryLevel: 76, temperature: undefined, remainingTime: 90 });
  });

  it("leaves progressing BMS temperatures to the independent writer without duplicating them in power history", async () => {
    const result = liveResult({ ...quota, "pd.soc": 76 }, now + 3_000);
    result.startedAt = now;
    result.frames.splice(1, 0,
      { ...result.frames[0], module: "bms", moduleTime: 50, receivedAt: now + 1_000, values: { temp: 37, soc: 75 } },
      { ...result.frames[0], module: "bms", moduleTime: 51, receivedAt: now + 2_000, values: { temp: 38, soc: 74 } },
    );
    const ctx = makeContext();
    captureReadingMock.mockResolvedValue(result);
    expect(await refresh(ctx, { force: true })).toMatchObject({ success: true, devicesRefreshed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({
      inputWatts: 400, acInputWatts: 400, dcInputWatts: 0, outputWatts: 100,
      inputQuality: "consistent", inputMeasurement: "delta2-pd-mqtt-v1",
      temperature: undefined, recordedAt: now + 3_000,
    });
    expect(mutationCalls(ctx, "devices_internal:recordTemperatureObservation")).toEqual([]);
  });

  it("includes the serial only in the quota URL, never the quota signature payload", async () => {
    await refresh(makeContext(), {});
    const quotaRequest = fetchMock.mock.calls.find(([input]) => String(input).includes("/quota/all?"));
    expect(quotaRequest?.[0]).toContain(`sn=${device.deviceSn}`);
    const headers = quotaRequest?.[1]?.headers as Record<string, string>;
    expect(headers.sign).toBe(generateSignature("test-secret", "test-access", {}, Number(headers.timestamp), headers.nonce));
  });

  it.each(["offline", "missing"])("rejects cached quota when device list says %s", async (state) => {
    fetchMock.mockResolvedValue(response(state === "offline" ? [{ sn: device.deviceSn, online: 0 }] : []));
    const ctx = makeContext();
    expect(await refresh(ctx, {})).toMatchObject({ success: false, devicesRefreshed: 0, devicesOffline: 1, devicesFailed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
    expect(mutationCalls(ctx, "readings:recordCollectionStatus")[0]?.[1]).toMatchObject({ status: "offline" });
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it.each(["network", "api", "http"])("returns a failed result for a quota %s failure without exposing upstream identifiers", async (failure) => {
    fetchMock.mockImplementation(async (input) => {
      if (String(input).endsWith("/device/list")) return response([{ sn: device.deviceSn, online: 1 }]);
      if (failure === "api") return response(quota, "5000");
      if (failure === "http") return new Response("unsafe upstream payload TEST-DEVICE-ONE", { status: 503 });
      throw new Error("unsafe upstream payload TEST-DEVICE-ONE");
    });
    const ctx = makeContext();
    const result = await refresh(ctx, {});
    expect(result).toMatchObject({ success: false, devicesFailed: 1, devicesSkipped: 0 });
    expect(JSON.stringify(result)).not.toContain(device.deviceSn);
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
  });

  it.each([null, {}, { "mppt.cfgChgWatts": 500 }, { "pd.wattsInSum": "Infinity", "bms_bmsStatus.soc": -1 }])(
    "does not accept an empty or unusable quota as a new reading (%j)", async (telemetry) => {
      mockTelemetry([device], telemetry);
      const ctx = makeContext();
      expect(await refresh(ctx, {})).toMatchObject({ success: false, devicesFailed: 1, devicesRefreshed: 0 });
      expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
    }
  );

  it("shares one liveness request across multiple devices", async () => {
    const ctx = makeContext([device, secondDevice]);
    expect(await refresh(ctx, {})).toMatchObject({ success: true, devicesRefreshed: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/device/list"))).toHaveLength(1);
  });

  it("does not use quota when the device-list request fails", async () => {
    fetchMock.mockResolvedValue(new Response("upstream failure", { status: 503 }));
    const ctx = makeContext([device, secondDevice]);
    expect(await refresh(ctx, {})).toMatchObject({ success: false, devicesFailed: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
  });

  it("reports malformed device-list data as a failure rather than offline devices", async () => {
    fetchMock.mockResolvedValue(response({ devices: [] }));
    const ctx = makeContext();
    expect(await refresh(ctx, {})).toMatchObject({ success: false, devicesFailed: 1, devicesOffline: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
  });

  it("uses live same-PD measurements despite contradictory cached INV/MPPT inputs", async () => {
    mockTelemetry([device], { ...quota, "pd.wattsInSum": 129, "pd.inputWatts": 129, "inv.inputWatts": 103, "mppt.inWatts": 378 });
    const ctx = makeContext();
    await refresh(ctx, {});
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({ inputWatts: 129, acInputWatts: 129, dcInputWatts: 0, inputQuality: "consistent" });
  });

  it("retains the original check time when a slow request fails later", async () => {
    fetchMock.mockImplementation(async () => {
      vi.mocked(Date.now).mockReturnValue(now + 60_000);
      throw new Error("request failed after newer collection completed");
    });
    const ctx = makeContext();
    await refresh(ctx, {});
    expect(mutationCalls(ctx, "readings:recordCollectionStatus")[0]?.[1]).toMatchObject({ checkedAt: now, status: "error" });
  });

  it("records an AC-to-solar change from measured channels despite an outdated charging flag", async () => {
    const ctx = makeContext();
    await refresh(ctx, {});
    mockTelemetry([device], { ...quota, "pd.wattsInSum": 378, "pd.inputWatts": 0, "pd.chargerType": 2, "inv.inputWatts": 0, "mppt.inWatts": 378 });
    await refresh(ctx, { force: true });
    const inserts = mutationCalls(ctx, "readings:insertReading");
    expect(inserts[0]?.[1]).toMatchObject({ acInputWatts: 400, dcInputWatts: 0 });
    expect(inserts[1]?.[1]).toMatchObject({ inputWatts: 378, acInputWatts: 0, dcInputWatts: 378, chargingType: 2, inputQuality: "consistent" });
  });

  it("keeps an older slow post-command quota behind a newer manual snapshot", async () => {
    let completeOldRequest: ((value: Response) => void) | undefined;
    const oldQuotaResponse = new Promise<Response>((resolve) => { completeOldRequest = resolve; });
    let quotaRequests = 0;
    fetchMock.mockImplementation(async (input) => {
      if (String(input).endsWith("/device/list")) return response([{ sn: device.deviceSn, online: 1 }]);
      quotaRequests++;
      if (quotaRequests === 1) return oldQuotaResponse;
      return response({ ...quota, "pd.wattsInSum": 378, "inv.inputWatts": 0, "mppt.inWatts": 378, "mppt.chgType": 2 });
    });
    const ctx = makeContext();
    captureReadingMock.mockResolvedValueOnce(liveResult(quota, now)).mockResolvedValueOnce(liveResult({
      ...quota, "pd.wattsInSum": 378, "pd.inputWatts": 0, "pd.chargerType": 2,
    }, now + 1_000));
    const oldCapture = refreshAfterSet(ctx, { deviceId: device._id, deviceSn: device.deviceSn });
    await vi.waitFor(() => expect(quotaRequests).toBe(1));
    vi.mocked(Date.now).mockReturnValue(now + 1_000);
    await refresh(ctx, { force: true });
    vi.mocked(Date.now).mockReturnValue(now + 2_000);
    completeOldRequest?.(response(quota));
    await oldCapture;
    const inserts = mutationCalls(ctx, "readings:insertReading").map((call) => call[1]);
    expect(inserts[0]).toMatchObject({ recordedAt: now + 1_000, acInputWatts: 0, dcInputWatts: 378 });
    expect(inserts[1]).toMatchObject({ recordedAt: now, acInputWatts: 400, dcInputWatts: 0 });
    expect(inserts[0]?.recordedAt).toBeGreaterThan(inserts[1]?.recordedAt as number);
  });

  it("times out a stalled GET without saving a reading", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("Aborted")));
    }));
    const ctx = makeContext();
    const pending = refresh(ctx, {});
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toMatchObject({ success: false, devicesFailed: 1 });
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
  });
});

describe("scheduled reading collection", () => {
  it("retains one power reading in each consecutive saved one-minute slot", async () => {
    const ctx = makeContext();
    let lastCollectionAt = now - 60_000;
    const originalQuery = ctx.runQuery.getMockImplementation()!;
    const originalMutation = ctx.runMutation.getMockImplementation()!;
    ctx.runQuery.mockImplementation(async (reference) => name(reference) === "settings:getCollectionSettingsForDevices"
      ? [{ userId: "user-one", collectionIntervalMinutes: 1, lastCollectionAt }]
      : originalQuery(reference));
    ctx.runMutation.mockImplementation(async (reference, args) => {
      if (name(reference) === "settings:updateLastCollection" && typeof args?.timestamp === "number") {
        lastCollectionAt = args.timestamp;
      }
      return originalMutation(reference, args);
    });

    expect(await collect(ctx, {})).toMatchObject({ success: true, totalReadings: 1 });
    vi.mocked(Date.now).mockReturnValue(now + 60_000);
    expect(await collect(ctx, {})).toMatchObject({ success: true, totalReadings: 1 });

    expect(captureReadingMock).toHaveBeenCalledTimes(2);
    expect(ctx.runAction).not.toHaveBeenCalled();
    expect(mutationCalls(ctx, "readings:insertReading").map(([, args]) => args?.recordedAt))
      .toEqual([now, now + 60_000]);
    expect(mutationCalls(ctx, "settings:updateLastCollection").map(([, args]) => args?.timestamp))
      .toEqual([now, now + 60_000]);
    expect(ctx.scheduler.runAfter).toHaveBeenCalledTimes(2);
  });

  it("preserves the development cron disable guard", async () => {
    vi.stubEnv("DISABLE_CRONS", "true");
    const ctx = makeContext();
    expect(await collect(ctx, {})).toMatchObject({ success: true, skipped: true });
    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not advance successful collection time for an offline-only cron run", async () => {
    mockTelemetry([]);
    const ctx = makeContext();
    expect(await collect(ctx, {})).toMatchObject({ success: false, totalReadings: 0, usersCollected: 0, devicesOffline: 1 });
    expect(mutationCalls(ctx, "settings:updateLastCollection")).toHaveLength(0);
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
  });

  it("does not advance successful collection time when all quota requests fail", async () => {
    mockTelemetry([device], {});
    const ctx = makeContext();
    expect(await collect(ctx, {})).toMatchObject({ success: false, totalReadings: 0, usersCollected: 0, devicesFailed: 1 });
    expect(mutationCalls(ctx, "settings:updateLastCollection")).toHaveLength(0);
  });

  it("collects the next minute slot despite sub-minute start-time jitter", async () => {
    const previous = Math.floor(now / 60_000) * 60_000 + 500;
    const current = previous + 59_900;
    vi.mocked(Date.now).mockReturnValue(current);
    const ctx = makeContext();
    ctx.runQuery.mockResolvedValueOnce([{ userId: "user-one", collectionIntervalMinutes: 1, lastCollectionAt: previous }]);
    expect(await collect(ctx, {})).toMatchObject({ success: true, totalReadings: 1 });
    expect(mutationCalls(ctx, "settings:updateLastCollection")[0]?.[1]).toMatchObject({ timestamp: current });
  });

  it("keeps partial success due so a failed sibling device retries on the next cron tick", async () => {
    mockTelemetry([device]);
    const ctx = makeContext([device, secondDevice]);
    expect(await collect(ctx, {})).toMatchObject({ success: false, totalReadings: 1, usersCollected: 1, devicesOffline: 1 });
    expect(mutationCalls(ctx, "settings:updateLastCollection")).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("validates the current device identity before post-command collection", async () => {
    const ctx = makeContext();
    expect(await refreshAfterSet(ctx, { deviceId: device._id, deviceSn: "OUTDATED-SERIAL" })).toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
  });

  it("applies the liveness gate to post-command refresh too", async () => {
    mockTelemetry([]);
    const ctx = makeContext();
    expect(await refreshAfterSet(ctx, { deviceId: device._id, deviceSn: device.deviceSn })).toMatchObject({ success: false, status: "offline" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mutationCalls(ctx, "readings:insertReading")).toHaveLength(0);
  });

  it("uses the shared quality parsing and persistence after a successful command", async () => {
    mockTelemetry([device], { ...quota, "pd.wattsInSum": 378, "pd.inputWatts": 0, "pd.chargerType": 2, "inv.inputWatts": 0, "mppt.inWatts": 378, "mppt.chgType": 2 });
    const ctx = makeContext();
    expect(await refreshAfterSet(ctx, { deviceId: device._id, deviceSn: device.deviceSn })).toMatchObject({ success: true, status: "refreshed" });
    expect(mutationCalls(ctx, "readings:insertReading")[0]?.[1]).toMatchObject({ inputQuality: "consistent", acInputWatts: 0, dcInputWatts: 378 });
  });
});
