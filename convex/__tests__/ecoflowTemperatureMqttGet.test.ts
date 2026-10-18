import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { connect, type MqttClient } from "mqtt";
import { inspect, sanitizeTemperatureGetReply, type TemperatureMqttGetResult } from "../ecoflowTemperatureMqttGet";

vi.mock("mqtt", () => ({ connect: vi.fn() }));
vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const now = 1_800_000_000_000;
const device = { _id: "test-device", deviceSn: "TEST-SERIAL", isActive: true };
const certificate = { protocol: "mqtts", url: "mqtt.ecoflow.com", port: "8883", certificateAccount: "test-account", certificatePassword: "test-password" };
const quotaTopic = `/open/test-account/TEST-SERIAL/quota`;
const replyTopic = `/open/test-account/TEST-SERIAL/get_reply`;
const fetchMock = vi.fn<typeof fetch>();

class TestClient extends EventEmitter {
  stream = { destroy: vi.fn() };
  connect = vi.fn(() => { queueMicrotask(() => this.emit("connect")); return this; });
  subscribe = vi.fn((topics: string[], _options: unknown, callback: (error: Error | null, grants?: Array<{ topic: string; qos: number }>, packet?: { granted: number[] }) => void) => {
    callback(null, topics.map(topic => ({ topic, qos: 0 })), { granted: topics.map(() => 0) }); return this;
  });
  publish = vi.fn((_topic: string, _payload: string, _options: unknown, callback: (error?: Error) => void) => {
    callback(); return this;
  });
  end = vi.fn((_force: boolean, _options: unknown, callback: () => void) => { queueMicrotask(callback); return this; });
}

function context(found: unknown = device) {
  return {
    runQuery: vi.fn().mockResolvedValue(found),
    runMutation: vi.fn(async (reference: FunctionReference<"mutation", "internal">, args?: Record<string, unknown>) => {
      void args;
      return getFunctionName(reference) === "devices_internal:claimMqttSession" ? { allowed: true } : null;
    }),
    runAction: vi.fn(), scheduler: { runAfter: vi.fn() },
  };
}
const invoke = (inspect as unknown as {
  _handler: (ctx: ReturnType<typeof context>, args: { deviceId: string; allowQuotaOnly?: boolean }) => Promise<TemperatureMqttGetResult>;
})._handler;
let client: TestClient;
function send(topic: string, payload: unknown, flags: { retain?: boolean; dup?: boolean } = {}) {
  client.emit("message", topic, Buffer.from(JSON.stringify(payload)), flags);
}
function request() { return JSON.parse(client.publish.mock.calls[0][1]) as { id: string; params: { quotas: string[] } }; }
async function start(allowQuotaOnly?: boolean) {
  const ctx = context();
  const result = invoke(ctx, { deviceId: device._id, allowQuotaOnly });
  await vi.advanceTimersByTimeAsync(0);
  return { ctx, result };
}
function expectLeaseOnly(ctx: ReturnType<typeof context>) {
  expect(ctx.runMutation.mock.calls.map(([reference]) => getFunctionName(reference)))
    .toEqual(["devices_internal:claimMqttSession", "devices_internal:releaseMqttSession"]);
  expect(ctx.runAction).not.toHaveBeenCalled();
  expect(ctx.scheduler.runAfter).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("ECOFLOW_ACCESS_KEY", "test-access"); vi.stubEnv("ECOFLOW_SECRET_KEY", "test-secret");
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ code: "0", data: certificate })));
  vi.stubGlobal("fetch", fetchMock);
  client = new TestClient();
  vi.mocked(connect).mockReset().mockReturnValue(client as unknown as MqttClient);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("fixed public MQTT temperature GET probe", () => {
  it("subscribes before one delayed read-only GET and preserves separate passive evidence without writes", async () => {
    const { result, ctx } = await start();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("https://api-e.ecoflow.com/iot-open/sign/certification", expect.objectContaining({ method: "GET" }));
    expect(client.subscribe).toHaveBeenCalledExactlyOnceWith([quotaTopic, replyTopic], { qos: 0 }, expect.any(Function));
    expect(client.publish).not.toHaveBeenCalled();
    send(quotaTopic, { moduleType: 2, typeCode: "bmsStatus", id: 100, time: 10, params: { soc: 76, temp: 37, serial: device.deviceSn } });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(client.publish).toHaveBeenCalledExactlyOnceWith("/open/test-account/TEST-SERIAL/get", expect.any(String), { qos: 0, retain: false }, expect.any(Function));
    expect(request()).toEqual({ id: String(now), version: "1.0", from: "Web", params: { quotas: [
      "bms_bmsStatus.temp", "bms_bmsStatus.minCellTemp", "bms_bmsStatus.maxCellTemp", "bms_bmsStatus.minMosTemp", "bms_bmsStatus.maxMosTemp",
    ] } });
    send(replyTopic, { id: request().id, code: "0", time: 11, data: { "bms_bmsStatus.temp": 37, serial: device.deviceSn }, message: "private error" });
    send(quotaTopic, { moduleType: 2, typeCode: "bmsStatus", id: 101, time: 11, params: { soc: 75 } });
    client.emit("connect");
    await vi.advanceTimersByTimeAsync(15_000);
    const captured = await result;
    expect(captured).toMatchObject({ reason: "deadline", connected: true, subscribed: true, requestPublishedAt: now + 5_000,
      subscriptions: { quota: 0, getReply: 0, unknownTopicCount: 0, callbackError: false },
      publishAcceptedAt: now + 5_000, replies: [{ receivedAt: now + 5_000, code: 0, moduleTime: 11, temperatures: { "bms_bmsStatus.temp": 37 } }],
      frames: [{ module: "bms", moduleTime: 10, values: { soc: 76, temp: 37 } }, { module: "bms", moduleTime: 11, values: { soc: 75 } }] });
    expect(captured.frames[0]).not.toHaveProperty("id");
    expect(captured).not.toHaveProperty("freshTemperature");
    expect(JSON.stringify(captured)).not.toMatch(/test-account|TEST-SERIAL|test-password|test-access|test-secret|private error/);
    expect(captured).not.toHaveProperty("id");
    expect(captured.replies[0]).not.toHaveProperty("id");
    expect(client.publish).toHaveBeenCalledTimes(1);
    expectLeaseOnly(ctx);
    expect(client.listenerCount("message")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts the exact numeric ID echo once without changing passive freshness or writing telemetry", async () => {
    const { result, ctx } = await start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(request().id).toBe(String(now));
    const reply = { id: Number(request().id), code: 0, data: { "bms_bmsStatus.temp": 37 } };
    send(replyTopic, reply, { retain: true });
    send(replyTopic, reply, { dup: true });
    send(replyTopic, { ...reply, id: reply.id + 1 });
    send(replyTopic, reply);
    send(replyTopic, { ...reply, id: request().id });
    await vi.advanceTimersByTimeAsync(15_000);
    const captured = await result;
    expect(captured).toMatchObject({ ignoredReplies: 4, frames: [], replies: [
      { receivedAt: now + 5_000, code: 0, moduleTime: null, temperatures: { "bms_bmsStatus.temp": 37 } },
    ] });
    expect(captured.replies).toHaveLength(1);
    expect(captured.replies[0]).not.toHaveProperty("id");
    expect(captured).not.toHaveProperty("freshTemperature");
    expect(client.publish).toHaveBeenCalledTimes(1);
    expectLeaseOnly(ctx);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses exactly the existing private diagnostic client ID with TLS and reconnect disabled", async () => {
    const { result, ctx } = await start();
    const expected = `eco-${createHash("sha256").update(JSON.stringify(["my-ecoflow", "test-account", device._id, "diagnostic"])).digest("hex").slice(0, 19)}`;
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ clientId: expected, protocol: "mqtts", port: 8883,
      rejectUnauthorized: true, clean: true, reconnectPeriod: 0, resubscribe: false, manualConnect: true }));
    expect(vi.mocked(connect).mock.calls[0][0]).not.toHaveProperty("will");
    expect(ctx.runMutation.mock.calls[0][1]).toMatchObject({ purpose: "diagnostic" });
    client.emit("error", new Error("private details"));
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: "connection_error" });
    expectLeaseOnly(ctx);
  });

  it("ignores unrelated, retained, duplicate and repeated replies while preserving passive flags", async () => {
    const { result } = await start();
    await vi.advanceTimersByTimeAsync(5_000);
    const reply = { id: request().id, code: 0, data: { "bms_bmsStatus.temp": 37 } };
    send(replyTopic, { ...reply, id: "unrelated-private-id" });
    send(replyTopic, reply, { retain: true });
    send(replyTopic, reply, { dup: true });
    send(replyTopic, reply);
    send(replyTopic, reply);
    const bms = { moduleType: 2, typeCode: "bmsStatus", id: 10, time: 5, params: { temp: 37 } };
    send(quotaTopic, bms, { retain: true });
    send(quotaTopic, bms);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toMatchObject({ ignoredReplies: 4, replies: [{ code: 0 }],
      frames: [{ retained: true, duplicate: false }, { retained: false, duplicate: true }] });
    expect((await result).replies).toHaveLength(1);
  });

  it.each([null, { ...device, isActive: false }])("rejects unavailable devices before any request (%j)", async found => {
    await expect(invoke(context(found), { deviceId: device._id })).rejects.toThrow("Active device not found");
    expect(fetchMock).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
  });

  it("returns busy without consuming another diagnostic session", async () => {
    const ctx = context(); ctx.runMutation.mockResolvedValue({ allowed: false });
    await expect(invoke(ctx, { deviceId: device._id })).resolves.toMatchObject({ reason: "capture_busy", frames: [], replies: [] });
    expect(fetchMock).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
    expect(ctx.runMutation).toHaveBeenCalledTimes(1);
  });

  it("requires credentials and refuses wildcard device identities", async () => {
    vi.stubEnv("ECOFLOW_SECRET_KEY", "");
    await expect(invoke(context(), { deviceId: device._id })).rejects.toThrow("EcoFlow credentials not configured");
    await expect(invoke(context({ ...device, deviceSn: "#/unsafe" }), { deviceId: device._id })).rejects.toThrow("Invalid device identity");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("releases the diagnostic lease if certification fails", async () => {
    const ctx = context(); fetchMock.mockRejectedValue(new Error("private credentials"));
    await expect(invoke(ctx, { deviceId: device._id })).rejects.toThrow("Unable to obtain EcoFlow MQTT certification");
    expectLeaseOnly(ctx); expect(connect).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it("does not publish if either exact subscription is rejected", async () => {
    client.subscribe.mockImplementation((_topics, _options, callback) => { callback(null, [{ topic: quotaTopic, qos: 0 }]); return client; });
    const { result, ctx } = await start();
    expect(await result).toMatchObject({ reason: "subscription_error", subscribed: false });
    expect(await result).toMatchObject({ subscriptions: { quota: 0, getReply: null, unknownTopicCount: 0, callbackError: false } });
    expect(client.publish).not.toHaveBeenCalled(); expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { quota: 0, getReply: 128 },
    { quota: 128, getReply: 0 },
    { quota: 1, getReply: 0 },
    { quota: 0, getReply: 2 },
  ])('reports only fixed numeric grant codes and refuses unsupported subscription grants (%j)', async grants => {
    client.subscribe.mockImplementation((_topics, _options, callback) => {
      callback(null, [{ topic: quotaTopic, qos: grants.quota }, { topic: replyTopic, qos: grants.getReply }]); return client;
    });
    const { result, ctx } = await start();
    expect(await result).toMatchObject({ reason: 'subscription_error', subscribed: false,
      subscriptions: { ...grants, unknownTopicCount: 0, callbackError: false } });
    expect(client.publish).not.toHaveBeenCalled(); expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it('reports mismatched grants and callback errors without returning any topic or upstream message', async () => {
    client.subscribe.mockImplementation((_topics, _options, callback) => {
      callback(new Error('private-account TEST-SERIAL'), [{ topic: quotaTopic, qos: 0 }, { topic: '/private-account/TEST-SERIAL', qos: 0 }]);
      return client;
    });
    const { result, ctx } = await start();
    const captured = await result;
    expect(captured).toMatchObject({ reason: 'subscription_error', subscribed: false,
      subscriptions: { quota: 0, getReply: null, unknownTopicCount: 1, callbackError: true } });
    expect(JSON.stringify(captured)).not.toMatch(/private-account|TEST-SERIAL|test-account/);
    expect(client.publish).not.toHaveBeenCalled(); expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it('reveals actual SUBACK rejection even when MQTT.js preserves both requested QoS0 objects', async () => {
    client.subscribe.mockImplementation((_topics, _options, callback) => {
      callback(Object.assign(new Error('private broker message'), { code: 128 }),
        [{ topic: quotaTopic, qos: 0 }, { topic: replyTopic, qos: 0 }], { granted: [0, 128] });
      return client;
    });
    const { result, ctx } = await start();
    expect(await result).toMatchObject({ reason: 'subscription_error', subscriptions: {
      quota: 0, getReply: 0, callbackError: true, callbackErrorCode: 128,
      actualAck: { quota: 0, getReply: 128, length: 2 },
    } });
    expect(JSON.stringify(await result)).not.toContain('private broker message');
    expect(client.publish).not.toHaveBeenCalled(); expectLeaseOnly(ctx);
  });

  it.each([{ granted: [] }, { granted: [0] }, { granted: [0, 0, 0] }, { granted: [128, 0] }, { granted: [0, 128] }])('fails closed on malformed or rejected actual acknowledgements (%j)', async ({ granted }) => {
    client.subscribe.mockImplementation((_topics, _options, callback) => {
      callback(null, [{ topic: quotaTopic, qos: 0 }, { topic: replyTopic, qos: 0 }], { granted }); return client;
    });
    const { result, ctx } = await start();
    expect(await result).toMatchObject({ reason: 'subscription_error', subscriptions: {
      callbackErrorCode: null, actualAck: { quota: granted[0] ?? null, getReply: granted[1] ?? null, length: granted.length },
    } });
    expect(client.publish).not.toHaveBeenCalled(); expectLeaseOnly(ctx);
  });

  it("sanitizes a failed fixed publication and cleans the socket and lease", async () => {
    client.publish.mockImplementation((_topic, _payload, _options, callback) => { callback(new Error("private error")); return client; });
    const { result, ctx } = await start();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toMatchObject({ reason: "publish_error", publishAcceptedAt: null });
    expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds all messages, including malformed and wrong-topic payloads, at50", async () => {
    const { result, ctx } = await start();
    for (let i = 0; i < 60; i++) send("/unowned/topic", null);
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: "frame_limit", receivedMessages: 50, frames: [], replies: [] });
    expect(client.publish).not.toHaveBeenCalled(); expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects more than64KiB before parsing", async () => {
    const { result, ctx } = await start();
    client.emit("message", replyTopic, Buffer.alloc(64 * 1024 + 1, 65), {});
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: "byte_limit", receivedBytes: 65537, replies: [] });
    expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it("hard-stops a stalled socket at20seconds and bounds cleanup without publishing", async () => {
    client.connect.mockImplementation(() => client); client.end.mockImplementation(() => client);
    const { result, ctx } = await start();
    await vi.advanceTimersByTimeAsync(20_500);
    expect(await result).toMatchObject({ reason: "deadline", connected: false });
    expect(client.stream.destroy).toHaveBeenCalledTimes(1); expect(client.publish).not.toHaveBeenCalled();
    expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });
});

describe("public read reply privacy", () => {
  it.each([
    ["decimal string", String(now), String(now)],
    ["numeric timestamp", now, String(now)],
    ["zero string", "0", "0"],
    ["zero number", 0, "0"],
    ["safe integer boundary", Number.MAX_SAFE_INTEGER, String(Number.MAX_SAFE_INTEGER)],
    ["equivalent numeric exponent", 1e3, "1000"],
  ])("accepts exact correlation for %s", (_label, id, requestId) => {
    expect(sanitizeTemperatureGetReply({ id, code: 0 }, String(requestId), now))
      .toEqual({ receivedAt: now, code: 0, moduleTime: null, temperatures: {} });
  });

  it.each([
    ["different string", "other", String(now)],
    ["different number", now + 1, String(now)],
    ["leading zero string", `0${now}`, String(now)],
    ["leading zero request", now, `0${now}`],
    ["decimal suffix string", `${now}.0`, String(now)],
    ["exponent string", "1.8e12", String(now)],
    ["leading whitespace", ` ${now}`, String(now)],
    ["trailing whitespace", `${now} `, String(now)],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1, String(Number.MAX_SAFE_INTEGER + 1)],
    ["rounded unsafe integer", Number.MAX_SAFE_INTEGER + 2, String(Number.MAX_SAFE_INTEGER + 1)],
    ["negative integer", -1, "-1"],
    ["negative zero", -0, "0"],
    ["fraction", 1.5, "1.5"],
    ["NaN", NaN, "NaN"],
    ["positive infinity", Infinity, "Infinity"],
    ["negative infinity", -Infinity, "-Infinity"],
    ["null", null, "null"],
    ["undefined", undefined, "undefined"],
    ["boolean", true, "true"],
    ["array", [now], String(now)],
    ["object", { value: now }, String(now)],
    ["boxed number", Object(now), String(now)],
    ["bigint", BigInt(now), String(now)],
  ])("rejects lossy, noncanonical, unsupported or unmatched correlation: %s", (_label, id, requestId) => {
    expect(sanitizeTemperatureGetReply({ id, code: 0 }, String(requestId), now)).toBeNull();
  });

  it("keeps only matching correlation, documented finite temperature fields and scalar code/module clock", () => {
    expect(sanitizeTemperatureGetReply({ id: "request", code: "-2", time: 123, data: {
      "bms_bmsStatus.temp": "0", "bms_bmsStatus.minCellTemp": 36, "bms_bmsStatus.maxCellTemp": Infinity,
      serial: device.deviceSn, password: "private",
    }, message: "private" }, "request", now)).toEqual({ receivedAt: now, code: -2, moduleTime: 123,
      temperatures: { "bms_bmsStatus.temp": 0, "bms_bmsStatus.minCellTemp": 36 } });
  });
  it.each([null, [], { id: "other", code: 0 }])("rejects malformed or unrelated replies (%j)", payload => {
    expect(sanitizeTemperatureGetReply(payload, "request", now)).toBeNull();
  });
  it("never echoes untrusted code strings or nonfinite clocks", () => {
    expect(sanitizeTemperatureGetReply({ id: "request", code: "private", time: Infinity, data: [] }, "request", now))
      .toEqual({ receivedAt: now, code: null, moduleTime: null, temperatures: {} });
  });
});

describe('explicit quota-only public GET experiment', () => {
  const bms = (time: number | null, params: Record<string, unknown>) => ({
    moduleType: 2, typeCode: 'bmsStatus', id: time, time, params,
  });
  function denyReply() {
    client.subscribe.mockImplementation((_topics, _options, callback) => {
      callback(Object.assign(new Error('private rejection'), { code: 128 }),
        [{ topic: quotaTopic, qos: 0 }, { topic: replyTopic, qos: 0 }], { granted: [0, 128] });
      return client;
    });
  }

  it('keeps optional reply denial evidence and sends one fixed GET after live BMS baseline and five seconds', async () => {
    denyReply();
    const { result, ctx } = await start(true);
    send(quotaTopic, bms(100, { soc: 76 }));
    await vi.advanceTimersByTimeAsync(4_999);
    expect(client.publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(client.publish).toHaveBeenCalledExactlyOnceWith('/open/test-account/TEST-SERIAL/get', expect.any(String), { qos: 0, retain: false }, expect.any(Function));
    expect(request().params.quotas).toEqual([
      'bms_bmsStatus.temp', 'bms_bmsStatus.minCellTemp', 'bms_bmsStatus.maxCellTemp', 'bms_bmsStatus.minMosTemp', 'bms_bmsStatus.maxMosTemp',
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    send(quotaTopic, bms(101, { temp: 37 }));
    await vi.advanceTimersByTimeAsync(54_000);
    const captured = await result;
    expect(captured).toMatchObject({ reason: 'deadline', subscribed: true, baselineAt: now, baselineClock: 100,
      requestPublishedAt: now + 5_000, publishAcceptedAt: now + 5_000, finishedAt: now + 60_000,
      subscriptions: { callbackError: true, callbackErrorCode: 128, actualAck: { quota: 0, getReply: 128, length: 2 } },
      frames: [{ moduleTime: 100, values: { soc: 76 } }, { moduleTime: 101, receivedAt: now + 6_000, values: { temp: 37 } }] });
    expect(captured).not.toHaveProperty('freshTemperature');
    expect(captured.replies).toEqual([]);
    expect(client.publish).toHaveBeenCalledTimes(1);
    expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for the first valid nonretained nonduplicate BMS clock when it arrives after five seconds', async () => {
    denyReply();
    const { result, ctx } = await start(true);
    await vi.advanceTimersByTimeAsync(14_000);
    send(quotaTopic, bms(1, { temp: 37 }), { retain: true });
    send(quotaTopic, bms(2, { temp: 37 }), { dup: true });
    send(quotaTopic, bms(null, { temp: 37 }));
    send(quotaTopic, bms(-1, { temp: 37 }));
    expect(client.publish).not.toHaveBeenCalled();
    send(quotaTopic, bms(3, { soc: 76 }));
    expect(client.publish).toHaveBeenCalledTimes(1);
    send(quotaTopic, bms(4, { soc: 75 }));
    await vi.advanceTimersByTimeAsync(46_000);
    expect(await result).toMatchObject({ reason: 'deadline', baselineAt: now + 14_000, baselineClock: 3, requestPublishedAt: now + 14_000 });
    expect(client.publish).toHaveBeenCalledTimes(1);
    expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it('never publishes without a live BMS clock baseline and stops at sixty seconds', async () => {
    denyReply();
    const { result, ctx } = await start(true);
    send(quotaTopic, { moduleType: 1, typeCode: 'pdStatus', time: 5, params: { wattsInSum: 100 } });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(client.end).not.toHaveBeenCalled();
    expect(client.publish).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toMatchObject({ reason: 'deadline', baselineAt: null, baselineClock: null,
      requestPublishedAt: null, finishedAt: now + 60_000 });
    expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it('does not turn a delta-only stream into a fresh temperature or carry the baseline value forward', async () => {
    denyReply();
    const { result, ctx } = await start(true);
    send(quotaTopic, bms(100, { temp: 37 }));
    await vi.advanceTimersByTimeAsync(5_000);
    send(quotaTopic, bms(101, { soc: 76, amp: -100 }));
    await vi.advanceTimersByTimeAsync(55_000);
    const captured = await result;
    expect(captured.frames.at(-1)?.values).toEqual({ soc: 76, amp: -100 });
    expect(captured).not.toHaveProperty('freshTemperature');
    expect(captured.replies).toEqual([]);
    expectLeaseOnly(ctx);
  });

  it('still refuses an actual quota rejection even when quota-only is explicitly allowed', async () => {
    client.subscribe.mockImplementation((_topics, _options, callback) => {
      callback(new Error('private rejection'), [{ topic: quotaTopic, qos: 0 }, { topic: replyTopic, qos: 0 }], { granted: [128, 0] });
      return client;
    });
    const { result, ctx } = await start(true);
    expect(await result).toMatchObject({ reason: 'subscription_error', subscribed: false,
      subscriptions: { actualAck: { quota: 128, getReply: 0, length: 2 } } });
    expect(client.publish).not.toHaveBeenCalled(); expectLeaseOnly(ctx);
  });

  it('caps quota-only traffic at120 messages and128KiB without writes or a SET publication', async () => {
    denyReply();
    const { result, ctx } = await start(true);
    for (let i = 0; i < 130; i++) send(quotaTopic, null);
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'frame_limit', receivedMessages: 120 });
    expect(client.publish).not.toHaveBeenCalled(); expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an oversized quota-only payload before parsing and releases its diagnostic lease', async () => {
    denyReply();
    const { result, ctx } = await start(true);
    client.emit('message', quotaTopic, Buffer.alloc(128 * 1024 + 1, 65), {});
    await vi.advanceTimersByTimeAsync(0);
    expect(await result).toMatchObject({ reason: 'byte_limit', receivedBytes: 131073 });
    expect(client.publish).not.toHaveBeenCalled(); expectLeaseOnly(ctx); expect(vi.getTimerCount()).toBe(0);
  });
});
