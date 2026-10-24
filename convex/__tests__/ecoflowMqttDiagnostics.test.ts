import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connect, type MqttClient } from "mqtt";
import { getFunctionName, type FunctionReference } from "convex/server";
import { capture, captureReading, captureReadingInProcess, captureTemperature, sanitizeQuotaFrame, type MqttDiagnosticResult } from "../ecoflowMqttDiagnostics";
import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { generateSignature } from "../ecoflow";

vi.mock("mqtt", () => ({ connect: vi.fn() }));
vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const device = { _id: "test-device", deviceSn: "TEST-SERIAL", isActive: true };
const certificate = { certificateAccount: "test-account", certificatePassword: "test-password", url: "mqtt.ecoflow.com", port: "8883", protocol: "mqtts" };
const topic = `/open/${certificate.certificateAccount}/${device.deviceSn}/quota`;
const pd = { moduleType: 1, typeCode: "pdStatus", id: 1, time: 12345, params: { wattsInSum: 105, acChargeFlag: 1, chgSunPower: 0 } };
const flags = { retained: false, duplicate: false };
const fetchMock = vi.fn<typeof fetch>();

class TestClient extends EventEmitter {
  stream = { destroy: vi.fn() };
  publish = vi.fn();
  connect = vi.fn(() => { queueMicrotask(() => this.emit("connect")); return this; });
  subscribe = vi.fn((subscribedTopic: string, _options: unknown, callback: (error: Error | null, grants?: Array<{ topic: string; qos: number }>) => void) => {
    callback(null, [{ topic: subscribedTopic, qos: 0 }]);
    return this;
  });
  end = vi.fn((_force: boolean, _options: unknown, callback: () => void) => { queueMicrotask(callback); return this; });
}

function context(found: unknown = device) {
  return { runQuery: vi.fn().mockResolvedValue(found), runMutation: vi.fn(async (reference: FunctionReference<'mutation', 'internal'>, args?: Record<string, unknown>) => {
    void args;
    return getFunctionName(reference) === 'devices_internal:claimMqttSession' ? { allowed: true } : null;
  }), scheduler: { runAfter: vi.fn() } };
}

function expectLeaseOnlyWrites(ctx: ReturnType<typeof context>) {
  expect(ctx.runMutation.mock.calls.map(([reference]) => getFunctionName(reference)))
    .toEqual(['devices_internal:claimMqttSession', 'devices_internal:releaseMqttSession']);
}
const invoke = (capture as unknown as {
  _handler: (ctx: ReturnType<typeof context>, args: { deviceId: string }) => Promise<MqttDiagnosticResult>;
})._handler;
const invokeReading = (captureReading as unknown as {
  _handler: typeof invoke;
})._handler;
const invokeTemperature = (captureTemperature as unknown as {
  _handler: typeof invoke;
})._handler;
const invokeInProcess: typeof invoke = (ctx, args) => captureReadingInProcess(
  ctx as unknown as ActionCtx, args.deviceId as Id<"devices">
);

let client: TestClient;
function response(data: unknown, code = "0") {
  return new Response(JSON.stringify({ code, data }));
}
function send(payload: unknown, metadata: { retain?: boolean; dup?: boolean } = {}, receivedTopic = topic) {
  client.emit("message", receivedTopic, Buffer.from(JSON.stringify(payload)), metadata);
}
async function start(invokeAction = invoke) {
  const ctx = context();
  const result = invokeAction(ctx, { deviceId: device._id });
  await vi.advanceTimersByTimeAsync(0);
  return { ctx, result };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  vi.stubEnv("ECOFLOW_ACCESS_KEY", "test-access");
  vi.stubEnv("ECOFLOW_SECRET_KEY", "test-secret");
  vi.stubEnv("TEMPERATURE_COLLECTION_ENABLED", "true");
  fetchMock.mockReset().mockResolvedValue(response(certificate));
  vi.stubGlobal("fetch", fetchMock);
  client = new TestClient();
  vi.mocked(connect).mockReset().mockReturnValue(client as unknown as MqttClient);
});

describe('live PD measurement readiness', () => {
  const fullPd = (time: number) => ({ ...pd, time, id: time, params: {
    wattsInSum: 105, inputWatts: 105, wattsOutSum: 160, chargerType: 0,
  } });
  const identifyPd = (time: number) => ({ ...pd, time, id: time, params: {
    model: 80, sysVer: 16908850, chargerType: 0,
  } });

  it('completes early after two complete progressing live PD reports and retains same-session metadata', async () => {
    const { result, ctx } = await start(invokeReading);
    send({ ...pd, time: 100, params: { model: 80, sysVer: 16908850, wifiVer: 197391 } });
    send(fullPd(101));
    await vi.advanceTimersByTimeAsync(5000);
    send(fullPd(102));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'measurement_ready', liveFrames: 3, finishedAt: 1_800_000_005_000 });
    expect((await result).frames[0].values).toEqual({ model: 80, sysVer: 16908850, wifiVer: 197391 });
    expect((await result).frames.at(-1)?.values).toEqual({ wattsInSum: 105, inputWatts: 105, wattsOutSum: 160, chargerType: 0 });
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(client.listenerCount('message')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(client.publish).not.toHaveBeenCalled();
    expectLeaseOnlyWrites(ctx);
  });

  it('does not combine partial PD powers or count retained, duplicate, repeated-clock, or reordered frames', async () => {
    const { result } = await start(invokeReading);
    send(identifyPd(0));
    send(fullPd(1), { retain: true });
    send(fullPd(2), { dup: true });
    send({ ...pd, time: 3, params: { wattsInSum: 105, inputWatts: 105 } });
    send({ ...pd, time: 4, params: { wattsOutSum: 160 } });
    send(fullPd(5)); // First qualifying complete live frame.
    send({ ...fullPd(5), id: 500, params: { wattsInSum: 106, inputWatts: 106, wattsOutSum: 161 } });
    send({ ...pd, time: 7, params: { wattsInSum: 107 } });
    send(fullPd(6)); // Older than the latest partial frame.
    send({ ...fullPd(8), moduleType: 3 }); // Wrong module/type pair.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ reason: 'deadline' });
    expect(client.listenerCount('message')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, null, -1])('cannot prove progress from absent/invalid module clocks (%s)', async time => {
    const { result } = await start(invokeReading);
    send(identifyPd(0));
    send({ ...fullPd(1), time });
    send(fullPd(2));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ reason: 'deadline' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['wattsInSum', 'wattsOutSum'])('does not accept a negative aggregate power (%s) as a live measurement', async field => {
    const { result } = await start(invokeReading);
    send(identifyPd(0));
    send({ ...fullPd(1), params: { ...fullPd(1).params, [field]: -1 } });
    send(fullPd(2));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ reason: 'deadline' });
  });

  it('keeps the passive diagnostic listening for its full deadline rather than stopping on complete PD frames', async () => {
    const { result } = await start();
    send(fullPd(1));
    send(fullPd(2));
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toMatchObject({ reason: 'deadline' });
  });

  it.each([
    {}, { model: 80 }, { sysVer: 16908850 }, { model: 80, sysVer: 16908851 }, { model: 81, sysVer: 16908850 },
  ])('proves power progress independently of absent or unsupported static metadata (%j)', async metadata => {
    const { result } = await start(invokeReading);
    send({ ...identifyPd(0), params: metadata });
    send(fullPd(1));
    send(fullPd(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'measurement_ready' });
    expect(client.listenerCount('message')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for a second complete packet after intervening partial metadata', async () => {
    const { result } = await start(invokeReading);
    send(fullPd(1));
    send({ ...pd, time: 2, params: { wattsInSum: 105, inputWatts: 105 } });
    expect(client.end).not.toHaveBeenCalled();
    send(identifyPd(3));
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    send(fullPd(4));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'measurement_ready' });
    expect((await result).frames.at(-1)?.values).toEqual(fullPd(4).params);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts supported identification in the second complete live PD packet', async () => {
    const { result } = await start(invokeReading);
    send(fullPd(1));
    send({ ...fullPd(2), params: { ...fullPd(2).params, ...identifyPd(2).params } });
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'measurement_ready', liveFrames: 2 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['retained', 'reordered'])('does not count %s identification as another complete power report', async kind => {
    const { result } = await start(invokeReading);
    send(fullPd(1));
    send(identifyPd(0), { retain: kind === 'retained' });
    send({ ...pd, time: 2, params: { wattsInSum: 105 } });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ reason: 'deadline' });
  });

  it('accepts a delta-only stream with no model, firmware, or charger type and unchanged powers', async () => {
    const { result } = await start(invokeReading);
    const powers = { wattsInSum: 105, inputWatts: 105, wattsOutSum: 160 };
    send({ ...fullPd(1), params: powers });
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    send({ ...fullPd(2), params: powers });
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'measurement_ready', liveFrames: 2, finishedAt: 1_800_000_005_000 });
    expect((await result).frames.at(-1)?.values).toEqual(powers);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts two advancing total-power PD reports when neither contains the AC branch', async () => {
    const { result } = await start(invokeReading);
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181, soc: 76 } });
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217, soc: 76 } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({ reason: 'measurement_ready', liveFrames: 2, finishedAt: 1_800_000_010_000 });
    expect((await result).frames.at(-1)?.values).toEqual({ wattsInSum: 228, wattsOutSum: 217, soc: 76 });
    expect((await result).frames.at(-1)?.values).not.toHaveProperty('inputWatts');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['retained', 'duplicate', 'replay', 'reordered'])('rejects %s totals-only reports as proof of live progress', async kind => {
    const { result } = await start(invokeReading);
    const report = (time: number) => ({ ...fullPd(time), params: { wattsInSum: 228, wattsOutSum: 217 } });
    send(report(2));
    send(report(kind === 'replay' ? 2 : kind === 'reordered' ? 1 : 3), { retain: kind === 'retained', dup: kind === 'duplicate' });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ reason: 'deadline' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ends the partial-AC grace early when a second explicit advancing MPPT solar report arrives', async () => {
    const { result } = await start(invokeReading);
    const mppt = (time: number, inWatts: number) => ({ moduleType: 5, typeCode: 'mpptStatus', id: time, time, params: { inWatts, chgType: 2 } });
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181 } });
    send(mppt(10, 230));
    await vi.advanceTimersByTimeAsync(1000);
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217 } });
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    send(mppt(11, 231));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'measurement_ready', finishedAt: 1_800_000_002_000 });
    expect((await result).frames.at(-1)?.values).toEqual({ inWatts: 231, chgType: 2 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the original 20-second deadline when totals become ready near the deadline', async () => {
    const { result } = await start(invokeReading);
    await vi.advanceTimersByTimeAsync(18_000);
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181 } });
    await vi.advanceTimersByTimeAsync(1000);
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217 } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toMatchObject({ reason: 'measurement_ready', finishedAt: 1_800_000_020_000 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['inputWatts', 'wattsInSum', 'outputWatts'])('rejects a newer partial PD power/source change (%s) during grace', async field => {
    const { result } = await start(invokeReading);
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181 } });
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217 } });
    send({ ...fullPd(3), params: { [field]: 0 } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({ reason: 'deadline' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 2])('invalidates proven totals after a nonduplicate PD clock reset/replay (%s) during grace', async time => {
    const { result } = await start(invokeReading);
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181 } });
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217 } });
    send({ ...fullPd(time), id: 999, params: { wattsInSum: 99, wattsOutSum: 98 } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({ reason: 'deadline' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([{ soc: 77 }, { privateUnknownField: 999 }])('invalidates proven totals after a PD metadata/empty-marker clock reset (%j)', async params => {
    const { result } = await start(invokeReading);
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181 } });
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217 } });
    send({ ...fullPd(0), id: 999, params });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({ reason: 'deadline' });
    expect(JSON.stringify(await result)).not.toContain('privateUnknownField');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['lower_metadata', 'lower_empty', 'equal_power'])('never recovers pre-break readiness after %s and a newer full PD packet', async kind => {
    const { result } = await start(invokeReading);
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181 } });
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217 } });
    send({ ...fullPd(kind === 'equal_power' ? 2 : 0), id: 999,
      params: kind === 'lower_metadata' ? { soc: 77 } : kind === 'lower_empty' ? { privateUnknownField: 999 } : { inputWatts: 0 } });
    send(fullPd(3)); // Must not reuse the two total reports from before the break.
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({ reason: 'deadline' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a newer PD metadata-only SOC report during grace', async () => {
    const { result } = await start(invokeReading);
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181 } });
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217 } });
    send({ ...fullPd(3), params: { soc: 77, remainTime: 20 } });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toMatchObject({ reason: 'measurement_ready' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([[5005, 'measurement_ready'], [6000, 'deadline']] as const)('bounds late grace callbacks without rejecting normal scheduling jitter (%sms)', async (delay, reason) => {
    const { result } = await start(invokeReading);
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181 } });
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217 } });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000 + delay);
    await vi.advanceTimersByTimeAsync(5000);
    const captured = await result;
    clock.mockRestore();
    expect(captured).toMatchObject({ reason, finishedAt: 1_800_000_000_000 + delay });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains an empty known MPPT delta as an invalidation marker instead of accepting an earlier solar pair', async () => {
    const { result } = await start(invokeReading);
    const mppt = (time: number, params: Record<string, number>) => ({ moduleType: 5, typeCode: 'mpptStatus', id: time, time, params });
    send(mppt(10, { inWatts: 230, chgType: 2 }));
    send(mppt(11, { inWatts: 231, chgType: 2 }));
    send(mppt(12, { privateUnknownField: 999 }));
    send({ ...fullPd(1), params: { wattsInSum: 221, wattsOutSum: 181 } });
    send({ ...fullPd(2), params: { wattsInSum: 228, wattsOutSum: 217 } });
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5000);
    const captured = await result;
    expect(captured).toMatchObject({ reason: 'measurement_ready', finishedAt: 1_800_000_005_000 });
    expect(captured.frames.filter(frame => frame.module === 'mppt').at(-1)?.values).toEqual({});
    expect(JSON.stringify(captured)).not.toContain('privateUnknownField');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('in-process MQTT power capture', () => {
  const fullPd = (time: number) => ({ ...pd, time, id: time, params: {
    wattsInSum: 105, inputWatts: 105, wattsOutSum: 160,
  } });

  it('retains the original measurement receipt and collector lease without scheduling another action', async () => {
    vi.stubEnv("TEMPERATURE_COLLECTION_ENABLED", undefined);
    const { ctx, result } = await start(invokeInProcess);
    send(fullPd(1));
    await vi.advanceTimersByTimeAsync(5_000);
    send(fullPd(2));
    await vi.advanceTimersByTimeAsync(0);

    const captured = await result;
    expect(captured).toMatchObject({ reason: 'measurement_ready', finishedAt: 1_800_000_005_000 });
    expect(captured.frames.at(-1)).toMatchObject({ receivedAt: 1_800_000_005_000,
      values: { wattsInSum: 105, inputWatts: 105, wattsOutSum: 160 } });
    expectLeaseOnlyWrites(ctx);
    expect(ctx.runMutation.mock.calls[0][1]).toMatchObject({ deviceId: device._id, purpose: 'collector' });
    expect(ctx.runMutation.mock.calls[1][1]).toEqual(ctx.runMutation.mock.calls[0][1]);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(client.publish).not.toHaveBeenCalled();
    expect(client.listenerCount('message')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the twenty-second deadline when fresh progressing power never arrives', async () => {
    const { ctx, result } = await start(invokeInProcess);
    send(fullPd(1), { retain: true });
    send(fullPd(2));
    send(fullPd(2)); // A duplicate cannot establish a second fresh observation.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ reason: 'deadline', finishedAt: 1_800_000_020_000 });
    expectLeaseOnlyWrites(ctx);
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns busy without certification or releasing another caller\'s lease', async () => {
    const ctx = context();
    ctx.runMutation.mockResolvedValue({ allowed: false });
    await expect(invokeInProcess(ctx, { deviceId: device._id })).resolves.toMatchObject({ reason: 'capture_busy', frames: [] });
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('releases its collector lease after a hard certification timeout', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const ctx = context();
    const pending = invokeInProcess(ctx, { deviceId: device._id }).catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toBe('Unable to obtain EcoFlow MQTT certification');
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expectLeaseOnlyWrites(ctx);
    expect(connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, { ...device, isActive: false }])('rejects unavailable devices before claiming a lease (%j)', async found => {
    const ctx = context(found);
    await expect(invokeInProcess(ctx, { deviceId: device._id })).rejects.toThrow('Active device not found');
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('independent fresh temperature capture', () => {
  it.each([undefined, "false", "TRUE", "1"])("does no database, credential, socket or timer work while paused (%s)", async value => {
    vi.stubEnv("TEMPERATURE_COLLECTION_ENABLED", value);
    vi.stubEnv("ECOFLOW_ACCESS_KEY", undefined);
    vi.stubEnv("ECOFLOW_SECRET_KEY", undefined);
    const ctx = context();
    await expect(invokeTemperature(ctx, { deviceId: device._id })).resolves.toMatchObject({
      reason: "disabled", connected: false, subscribed: false, frames: [],
    });
    expect(ctx.runQuery).not.toHaveBeenCalled();
    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  const bms = (time: number | null, params: Record<string, unknown>) => ({
    moduleType: 2, typeCode: 'bmsStatus', id: time, time, params,
  });
  const temperatureWrites = (ctx: ReturnType<typeof context>) => ctx.runMutation.mock.calls
    .filter(([reference]) => getFunctionName(reference) === 'devices_internal:recordTemperatureObservation');

  it('persists only explicit temperature from a later progressing BMS packet, at its actual receipt time', async () => {
    const { ctx, result } = await start(invokeTemperature);
    send(bms(100, { soc: 76, temp: 39 }));
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(35_000);
    send(bms(101, { temp: 0, minCellTemp: 36, maxMosTemp: 42 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'temperature_ready', finishedAt: 1_800_000_035_000 });
    expect(temperatureWrites(ctx)[0]?.[1]).toEqual({ deviceId: device._id,
      temperature: 0, receivedAt: 1_800_000_035_000, leaseToken: expect.any(String) });
    expect(ctx.runMutation.mock.calls.map(([reference]) => getFunctionName(reference)))
      .toEqual(['devices_internal:claimMqttSession', 'devices_internal:recordTemperatureObservation', 'devices_internal:releaseMqttSession']);
    const calls = ctx.runMutation.mock.calls as unknown as Array<[unknown, { purpose?: string; token?: string }]>;
    expect(calls[0][1]).toMatchObject({ purpose: 'temperature' });
    expect(temperatureWrites(ctx)[0]?.[1]?.leaseToken).toEqual(calls[0][1].token);
    expect(calls.at(-1)?.[1]).toEqual(calls[0][1]);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(client.publish).not.toHaveBeenCalled();
    expect(client.listenerCount('message')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts a partial BMS baseline but never carries an earlier temp through a later partial report', async () => {
    const { ctx, result } = await start(invokeTemperature);
    send(bms(1, { temp: 39 }));
    send(bms(2, { soc: 76 }));
    send(bms(3, { minCellTemp: 36, maxCellTemp: 38, minMosTemp: 37, maxMosTemp: 42 }));
    await vi.advanceTimersByTimeAsync(330_000);
    expect(await result).toMatchObject({ reason: 'deadline', finishedAt: 1_800_000_330_000 });
    expect(temperatureWrites(ctx)).toHaveLength(0);
    expectLeaseOnlyWrites(ctx);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps listening beyond 65 seconds and stops on a fresh five-minute BMS temperature report', async () => {
    const { ctx, result } = await start(invokeTemperature);
    send(bms(100, { soc: 76 }));
    await vi.advanceTimersByTimeAsync(65_001);
    expect(client.end).not.toHaveBeenCalled();
    send(bms(101, { soc: 75 }));
    await vi.advanceTimersByTimeAsync(233_499);
    send(bms(102, { temp: 39 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'temperature_ready', finishedAt: 1_800_000_298_500 });
    expect(temperatureWrites(ctx)[0]?.[1]).toEqual({ deviceId: device._id,
      temperature: 39, receivedAt: 1_800_000_298_500, leaseToken: expect.any(String) });
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['retained', 'duplicate', 'same_clock', 'reordered', 'missing_clock', 'negative_clock', 'string', 'wrong_module'])(
    'does not treat %s temperature as fresh', async kind => {
      const { ctx, result } = await start(invokeTemperature);
      send(bms(10, { soc: 76 }));
      let report: ReturnType<typeof bms> = bms(11, { temp: 39 });
      if (kind === 'same_clock') report = bms(10, { temp: 39 });
      if (kind === 'reordered') { send(bms(12, { soc: 75 })); report = bms(11, { temp: 39 }); }
      if (kind === 'missing_clock') report = bms(null, { temp: 39 });
      if (kind === 'negative_clock') report = bms(-1, { temp: 39 });
      if (kind === 'string') report = bms(11, { temp: '39' });
      if (kind === 'wrong_module') report = { ...report, moduleType: 1 };
      send(report, { retain: kind === 'retained', dup: kind === 'duplicate' });
      await vi.advanceTimersByTimeAsync(330_000);
      expect(await result).toMatchObject({ reason: 'deadline' });
      expect(temperatureWrites(ctx)).toHaveLength(0);
      expectLeaseOnlyWrites(ctx);
    }
  );

  it('does not seed progress from retained or duplicate initial BMS packets', async () => {
    const { ctx, result } = await start(invokeTemperature);
    send(bms(1, { soc: 76 }), { retain: true });
    send(bms(2, { soc: 76 }), { dup: true });
    send(bms(3, { temp: 39 }));
    await vi.advanceTimersByTimeAsync(330_000);
    expect(await result).toMatchObject({ reason: 'deadline' });
    expect(temperatureWrites(ctx)).toHaveLength(0);
  });

  it('keeps the thermal lease independent and returns busy without a socket or display write', async () => {
    const ctx = context();
    ctx.runMutation.mockResolvedValue({ allowed: false });
    await expect(invokeTemperature(ctx, { deviceId: device._id })).resolves.toMatchObject({ reason: 'capture_busy', frames: [] });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
  });

  it('uses a different stable private client ID from the power collector', async () => {
    fetchMock.mockImplementation(async () => response(certificate));
    const power = await start(invokeReading);
    client.emit('error', new Error('failed'));
    await vi.advanceTimersByTimeAsync(0);
    await power.result;
    const thermal = await start(invokeTemperature);
    client.emit('error', new Error('failed'));
    await vi.advanceTimersByTimeAsync(0);
    await thermal.result;
    const ids = vi.mocked(connect).mock.calls.map(([options]) => (options as unknown as { clientId: string }).clientId);
    expect(ids[1]).not.toBe(ids[0]);
    expect(ids[1]).toHaveLength(23);
    expect(ids[1]).not.toContain(device._id);
  });

  it('caps all thermal messages at 800 independently of the power diagnostic limit', async () => {
    const { result, ctx } = await start(invokeTemperature);
    for (let index = 0; index < 810; index++) send(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'frame_limit', receivedMessages: 800 });
    expectLeaseOnlyWrites(ctx);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('caps thermal bytes at 512 KiB before parsing oversized payloads', async () => {
    const { result, ctx } = await start(invokeTemperature);
    client.emit('message', topic, Buffer.alloc(512 * 1024 + 1, 65), {});
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'byte_limit', receivedBytes: 524289, frames: [] });
    expectLeaseOnlyWrites(ctx);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds thermal connection and cleanup with no health or history mutations on timeout', async () => {
    client.connect.mockImplementation(() => client);
    client.end.mockImplementation(() => client);
    const { result, ctx } = await start(invokeTemperature);
    await vi.advanceTimersByTimeAsync(329_999);
    expect(client.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(501);
    expect(await result).toMatchObject({ reason: 'deadline', connected: false, subscribed: false });
    expect(client.stream.destroy).toHaveBeenCalledExactlyOnceWith();
    expectLeaseOnlyWrites(ctx);
    expect(vi.getTimerCount()).toBe(0);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("diagnostic MQTT quota parsing", () => {
  it("keeps only finite numeric allowlisted data without identities, credentials, or arbitrary payloads", () => {
    const frame = sanitizeQuotaFrame({ ...pd, id: "unsafe-id", time: Infinity, params: {
      ...pd.params, inputWatts: 104, outputWatts: 163, inWatts: 0, outWatts: 0,
      wattsOutSum: NaN, chgPowerAC: "900", chargerType: 0, chgDsgState: 1,
      redunChargeFlag: 0, pvChgPrioSet: 1, serial: "TEST-SERIAL", certificatePassword: "test-password", nested: {},
    } }, 100, flags);
    expect(frame).toEqual({ module: "pd", receivedAt: 100, moduleTime: null, id: null, ...flags,
      values: { wattsInSum: 105, inputWatts: 104, outputWatts: 163, inWatts: 0, outWatts: 0,
        acChargeFlag: 1, chgSunPower: 0, chargerType: 0, chgDsgState: 1, redunChargeFlag: 0, pvChgPrioSet: 1 } });
  });

  it.each([
    null, [], { ...pd, params: [] }, { ...pd, params: null }, { ...pd, moduleType: 3 },
    { ...pd, typeCode: "unknown" }, { ...pd, typeCode: "__proto__" }, { ...pd, moduleType: "1" },
  ])("rejects malformed or mismatched module frames (%j)", (payload) => {
    expect(sanitizeQuotaFrame(payload, 100, flags)).toBeNull();
  });

  it('keeps known PD/MPPT empty markers without exposing unknown or malformed measurement values', () => {
    const payload = { ...pd, params: { wattsInSum: Infinity, serial: 'TEST-SERIAL', secret: 'test-secret', nested: {} } };
    expect(sanitizeQuotaFrame(payload, 100, flags)).toEqual({ module: 'pd', moduleTime: 12345, id: 1, receivedAt: 100, ...flags, values: {} });
    expect(JSON.stringify(sanitizeQuotaFrame(payload, 100, flags))).not.toMatch(/TEST-SERIAL|test-secret|nested/);
  });

  it("recognizes independent INV and MPPT frames and retains their unconverted module clocks", () => {
    expect(sanitizeQuotaFrame({ moduleType: 3, typeCode: "invStatus", time: 6910941, params: { inputWatts: 114, acInVol: 235094, acInAmp: 829, chargerType: 1 } }, 100, flags))
      .toMatchObject({ module: "inv", moduleTime: 6910941, receivedAt: 100, values: { inputWatts: 114, acInVol: 235094, acInAmp: 829, chargerType: 1 } });
    expect(sanitizeQuotaFrame({ moduleType: 5, typeCode: "mpptStatus", params: { inWatts: 0, x60ChgType: 3, chgType: 0 } }, 100, flags))
      .toMatchObject({ module: "mppt", values: { inWatts: 0, x60ChgType: 3, chgType: 0 } });
  });

  it('captures same-session battery/EMS and PD output breakdown without unrelated raw data', () => {
    expect(sanitizeQuotaFrame({ ...pd, params: { carWatts: 5, usb1Watts: 1, usb2Watts: 2, qcUsb1Watts: 3,
      qcUsb2Watts: 4, typec1Watts: 6, typec2Watts: 7 } }, 100, flags)?.values)
      .toEqual({ carWatts: 5, usb1Watts: 1, usb2Watts: 2, qcUsb1Watts: 3, qcUsb2Watts: 4, typec1Watts: 6, typec2Watts: 7 });
    expect(sanitizeQuotaFrame({ moduleType: 2, typeCode: 'bmsStatus', params: { soc: 80, temp: 32, f32ShowSoc: 79.8,
      vol: 53000, amp: -138, serial: 'TEST-SERIAL' } }, 100, flags))
      .toMatchObject({ module: 'bms', values: { soc: 80, temp: 32, f32ShowSoc: 79.8, vol: 53000, amp: -138 } });
    expect(sanitizeQuotaFrame({ moduleType: 2, typeCode: 'emsStatus', params: { chgRemainTime: 50, dsgRemainTime: 100,
      chgState: 1, f32LcdShowSoc: 79.8 } }, 100, flags))
      .toMatchObject({ module: 'ems', values: { chgRemainTime: 50, dsgRemainTime: 100, chgState: 1, f32LcdShowSoc: 79.8 } });
  });

  it('preserves separate live BMS cell and MOS temperatures without relabeling them as generic temperature', () => {
    expect(sanitizeQuotaFrame({ moduleType: 2, typeCode: 'bmsStatus', time: 100,
      params: { minCellTemp: 26, maxCellTemp: 29, minMosTemp: 27, maxMosTemp: 31 } }, 1000, flags))
      .toMatchObject({ module: 'bms', moduleTime: 100, values: { minCellTemp: 26, maxCellTemp: 29, minMosTemp: 27, maxMosTemp: 31 } });
    expect(sanitizeQuotaFrame({ moduleType: 2, typeCode: 'bmsStatus', params: { minCellTemp: 26 } }, 1000, flags)?.values)
      .not.toHaveProperty('temp');
  });
});

describe("bounded passive EcoFlow MQTT diagnostic", () => {
  it.each([null, { ...device, isActive: false }])("rejects unavailable/inactive devices before any external request", async (found) => {
    await expect(invoke(context(found), { deviceId: device._id })).rejects.toThrow("Active device not found");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("requires backend credentials before requesting certification", async () => {
    vi.stubEnv("ECOFLOW_SECRET_KEY", "");
    await expect(invoke(context(), { deviceId: device._id })).rejects.toThrow("EcoFlow credentials not configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs only the read-only certification GET and subscribes exactly once with no publications or writes", async () => {
    const { result, ctx } = await start();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api-e.ecoflow.com/iot-open/sign/certification");
    expect(options?.method).toBe("GET");
    expect(options).not.toHaveProperty("body");
    const headers = options?.headers as Record<string, string>;
    expect(headers.sign).toBe(generateSignature("test-secret", "test-access", {}, Number(headers.timestamp), headers.nonce));
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "mqtts", host: "mqtt.ecoflow.com", port: 8883, username: "test-account", password: "test-password",
      clean: true, protocolVersion: 4, reconnectPeriod: 0, resubscribe: false,
      manualConnect: true, rejectUnauthorized: true, connectTimeout: 5000,
    }));
    expect(vi.mocked(connect).mock.calls[0]?.[0]).not.toHaveProperty("will");
    expect(client.subscribe).toHaveBeenCalledTimes(1);
    expect(client.subscribe).toHaveBeenCalledWith(topic, { qos: 0 }, expect.any(Function));
    send(pd);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ reason: "deadline", connected: true, subscribed: true, liveFrames: 1 });
    expect(client.publish).not.toHaveBeenCalled();
    expectLeaseOnlyWrites(ctx);
    expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(JSON.stringify(await result)).not.toMatch(/TEST-SERIAL|test-account|test-password|test-access|test-secret/);
    expect(client.end).toHaveBeenCalledWith(true, {}, expect.any(Function));
    expect(client.listenerCount("message")).toBe(0);
    expect(client.listenerCount("error")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { ...certificate, protocol: "mqtt" }, { ...certificate, port: "1883" },
    { ...certificate, url: "evil.example" }, { ...certificate, url: "mqtt.ecoflow.com.evil.example" },
    { ...certificate, url: "user@mqtt.ecoflow.com" }, { ...certificate, url: "mqtt.ecoflow.com/path" },
    { ...certificate, certificateAccount: "account/#" }, { ...certificate, certificatePassword: "" }, [], null,
  ])("rejects unsafe broker/certificate data without exposing it (%j)", async (data) => {
    fetchMock.mockResolvedValue(response(data));
    await expect(invoke(context(), { deviceId: device._id })).rejects.toThrow("Unable to obtain EcoFlow MQTT certification");
    expect(connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hard-times out a stalled certification request and aborts it", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const result = invoke(context(), { deviceId: device._id }).catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toBe("Unable to obtain EcoFlow MQTT certification");
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses stable private client IDs per device/purpose and releases the matching token', async () => {
    fetchMock.mockImplementation(async () => response(certificate));
    const first = await start();
    client.emit('error', new Error('connection failed'));
    await vi.advanceTimersByTimeAsync(0);
    await first.result;
    const firstId = vi.mocked(connect).mock.calls[0]?.[0];
    const second = await start();
    client.emit('error', new Error('connection failed'));
    await vi.advanceTimersByTimeAsync(0);
    await second.result;
    const third = await start(invokeReading);
    client.emit('error', new Error('connection failed'));
    await vi.advanceTimersByTimeAsync(0);
    await third.result;
    const options = vi.mocked(connect).mock.calls.map(([value]) => value as unknown as { clientId: string });
    expect(options[0].clientId).toBe(options[1].clientId);
    expect(options[0].clientId).not.toBe(options[2].clientId);
    expect(options[0].clientId).toHaveLength(23);
    expect(JSON.stringify(firstId)).not.toContain(device._id);
    const calls = first.ctx.runMutation.mock.calls as unknown as Array<[unknown, { deviceId: string; purpose: string; token: string }]>;
    expect(calls[0][1]).toMatchObject({ deviceId: device._id, purpose: 'diagnostic' });
    expect(calls[1][1]).toEqual(calls[0][1]);
  });

  it('reports overlapping captures as busy without certification, connection, or releasing another lease', async () => {
    const ctx = context();
    ctx.runMutation.mockResolvedValue({ allowed: false });
    await expect(invoke(ctx, { deviceId: device._id })).resolves.toMatchObject({
      reason: 'capture_busy', connected: false, subscribed: false, frames: [], liveFrames: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
  });

  it('releases its lease when certification fails before a socket is created', async () => {
    fetchMock.mockRejectedValue(new Error('private upstream details'));
    const ctx = context();
    await expect(invoke(ctx, { deviceId: device._id })).rejects.toThrow('Unable to obtain EcoFlow MQTT certification');
    expectLeaseOnlyWrites(ctx);
    expect(connect).not.toHaveBeenCalled();
  });

  it("separates retained and repeated frames from live observations and rejects wrong-topic data", async () => {
    const { result } = await start();
    send(pd, { retain: true });
    send(pd); // A duplicate of the retained snapshot is still not fresh evidence.
    send({ ...pd, id: 2, time: 12346, params: { wattsInSum: 106 } });
    send({ ...pd, id: 3 }, { dup: true });
    send(pd, {}, "/open/unowned/device/quota");
    client.emit("message", topic, Buffer.from("not-json"), {});
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ liveFrames: 1, retainedFrames: 1, duplicateFrames: 2, rejectedFrames: 2, receivedMessages: 6 });
    expect(await result).toMatchObject({
      envelopeCounts: { paramsObject: 4, dataObject: 0, otherObject: 0, nonObject: 0, malformedJson: 1 },
      moduleCounts: { pd: 4, inv: 0, mppt: 0, other: 0 },
    });
    expect((await result).frames).toHaveLength(4);
  });

  it("caps malformed, duplicate, and valid messages together at 50", async () => {
    const { result } = await start();
    for (let index = 0; index < 60; index++) send(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: "frame_limit", receivedMessages: 50, rejectedFrames: 50, frames: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports fixed shape/module counters for rejected envelopes without returning untrusted labels or contents", async () => {
    const { result } = await start();
    send({ moduleType: 1, typeCode: "unsafe-id", data: { serial: "TEST-SERIAL" } });
    send({ moduleType: 999, typeCode: "test-password", secret: "test-account" });
    send([]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({ rejectedFrames: 3, frames: [],
      envelopeCounts: { paramsObject: 0, dataObject: 1, otherObject: 1, nonObject: 1, malformedJson: 0 },
      moduleCounts: { pd: 1, inv: 0, mppt: 0, other: 1 },
    });
    expect(JSON.stringify(await result)).not.toMatch(/TEST-SERIAL|unsafe-id|test-account|test-password/);
  });

  it("caps bytes before parsing or returning oversized payloads", async () => {
    const { result } = await start();
    client.emit("message", topic, Buffer.alloc(64 * 1024 + 1, 65), {});
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: "byte_limit", receivedBytes: 65537, frames: [], liveFrames: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sanitizes socket errors and closes immediately without reconnecting", async () => {
    const { result } = await start();
    client.emit("error", new Error("unsafe test-account TEST-SERIAL test-password"));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: "connection_error" });
    expect(JSON.stringify(await result)).not.toMatch(/unsafe|test-account|TEST-SERIAL|test-password/);
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports subscription rejection and does not accept messages", async () => {
    client.subscribe.mockImplementation((_topic, _options, callback) => { callback(new Error("unsafe detail")); return client; });
    const { result } = await start();
    expect(await result).toMatchObject({ reason: "subscription_error", connected: true, subscribed: false, frames: [] });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds the entire MQTT connection wait and forcibly cleans up an unresponsive close", async () => {
    client.connect.mockImplementation(() => client);
    client.end.mockImplementation(() => client);
    const { result } = await start();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(client.end).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toMatchObject({ reason: "deadline", connected: false, subscribed: false });
    expect(client.stream.destroy).toHaveBeenCalledTimes(1);
    expect(client.listenerCount("message")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
