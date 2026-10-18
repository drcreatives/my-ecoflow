"use node";

import { createHash, randomUUID } from "node:crypto";
import { connect, type MqttClient, type IPublishPacket } from "mqtt";
import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { generateSignature, hasPdPowerOrSourceFields } from "./ecoflow";
import { selectSolarPanelTelemetry } from "./solarPanelTelemetry";

const CERTIFICATE_TIMEOUT_MS = 15_000;
const MQTT_DEADLINE_MS = 20_000;
const SOLAR_COMPANION_GRACE_MS = 5_000;
// Timer callbacks can run a little late; do not reject valid totals for normal
// scheduling jitter. This does not extend the requested grace/session timers.
const MAX_READY_TOTAL_AGE_MS = SOLAR_COMPANION_GRACE_MS + 500;
const CLOSE_TIMEOUT_MS = 500;
const FRAME_LIMIT = 50;
const BYTE_LIMIT = 64 * 1024;
const TEMPERATURE_DEADLINE_MS = 330_000;
const TEMPERATURE_FRAME_LIMIT = 800;
const TEMPERATURE_BYTE_LIMIT = 512 * 1024;

const MODULES = {
  pdStatus: {
    moduleType: 1,
    module: "pd",
    fields: ["wattsInSum", "wattsOutSum", "inputWatts", "outputWatts", "inWatts", "outWatts", "soc", "remainTime", "chgPowerAC", "chgPowerDC", "chgSunPower", "chargerType", "chgDsgState", "acChargeFlag", "redunChargeFlag", "pvChgPrioSet", "model", "sysVer", "wifiVer", "carWatts", "usb1Watts", "usb2Watts", "qcUsb1Watts", "qcUsb2Watts", "typec1Watts", "typec2Watts"],
  },
  bmsStatus: {
    moduleType: 2,
    module: "bms",
    fields: ["temp", "minCellTemp", "maxCellTemp", "minMosTemp", "maxMosTemp", "soc", "f32ShowSoc", "vol", "amp"],
  },
  emsStatus: {
    moduleType: 2,
    module: "ems",
    fields: ["chgRemainTime", "dsgRemainTime", "chgState", "f32LcdShowSoc"],
  },
  invStatus: {
    moduleType: 3,
    module: "inv",
    fields: ["inputWatts", "outputWatts", "acInVol", "acInAmp", "chargerType", "invOutVol", "invOutAmp", "dcInVol", "dcInAmp", "chgPauseFlag"],
  },
  mpptStatus: {
    moduleType: 5,
    module: "mppt",
    fields: ["inWatts", "inVol", "inAmp", "outWatts", "outVol", "outAmp", "chgType", "chgState", "x60ChgType", "cfgChgType"],
  },
} as const;

export interface DiagnosticFrame {
  module: "pd" | "inv" | "mppt" | "bms" | "ems";
  receivedAt: number;
  moduleTime: number | null;
  id: number | null;
  retained: boolean;
  duplicate: boolean;
  values: Record<string, number>;
}

type StopReason = "deadline" | "measurement_ready" | "temperature_ready" | "capture_busy" | "frame_limit" | "byte_limit" | "connection_error" | "subscription_error" | "connection_closed";

export interface MqttDiagnosticResult {
  reason: StopReason;
  startedAt: number;
  finishedAt: number;
  connected: boolean;
  subscribed: boolean;
  receivedMessages: number;
  receivedBytes: number;
  rejectedFrames: number;
  duplicateFrames: number;
  retainedFrames: number;
  liveFrames: number;
  envelopeCounts: { paramsObject: number; dataObject: number; otherObject: number; nonObject: number; malformedJson: number };
  moduleCounts: { pd: number; inv: number; mppt: number; bms: number; ems: number; other: number };
  frames: DiagnosticFrame[];
}

interface Certification {
  username: string;
  password: string;
  host: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Preserve only documented power fields, never arbitrary device payloads. */
export function sanitizeQuotaFrame(
  payload: unknown,
  receivedAt: number,
  flags: { retained: boolean; duplicate: boolean },
): DiagnosticFrame | null {
  if (!isObject(payload) || !isObject(payload.params) || !Number.isFinite(receivedAt)) return null;
  const typeCode = payload.typeCode;
  if (typeof typeCode !== "string" || !Object.prototype.hasOwnProperty.call(MODULES, typeCode)) return null;
  const definition = MODULES[typeCode as keyof typeof MODULES];
  if (payload.moduleType !== definition.moduleType) return null;
  const values: Record<string, number> = {};
  for (const field of definition.fields) {
    const value = finiteNumber(payload.params[field]);
    if (value !== null) values[field] = value;
  }
  // Known PD/MPPT headers can reveal a clock reset or invalidate a solar pair
  // even with no allowed values. Never retain their unknown payload fields.
  if (Object.keys(values).length === 0 && definition.module !== "mppt" && definition.module !== "pd") return null;
  return {
    module: definition.module,
    receivedAt,
    // EcoFlow's module clock has no documented epoch; retain it as diagnostics only.
    moduleTime: finiteNumber(payload.time),
    id: finiteNumber(payload.id),
    retained: flags.retained,
    duplicate: flags.duplicate,
    values,
  };
}

export async function getCertification(accessKey: string, secretKey: string): Promise<Certification> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timestamp = Date.now();
    const nonce = Math.floor(100_000 + Math.random() * 900_000).toString();
    const sign = generateSignature(secretKey, accessKey, {}, timestamp, nonce);
    const request = (async () => {
      const response = await fetch("https://api-e.ecoflow.com/iot-open/sign/certification", {
        method: "GET",
        signal: controller.signal,
        headers: { accessKey, timestamp: timestamp.toString(), nonce, sign },
      });
      if (!response.ok) throw new Error("Certification failed");
      const payload: unknown = await response.json();
      if (!isObject(payload) || String(payload.code) !== "0" || !isObject(payload.data)) throw new Error("Certification failed");
      const data = payload.data;
      if (
        data.protocol !== "mqtts" || String(data.port) !== "8883" ||
        typeof data.url !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.ecoflow\.com$/i.test(data.url) ||
        typeof data.certificateAccount !== "string" || !data.certificateAccount || data.certificateAccount.length > 1024 ||
        /[\/#\u0000+]/.test(data.certificateAccount) ||
        typeof data.certificatePassword !== "string" || !data.certificatePassword || data.certificatePassword.length > 1024
      ) throw new Error("Certification failed");
      return { username: data.certificateAccount, password: data.certificatePassword, host: data.url };
    })();
    return await Promise.race([
      request,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Certification failed"));
        }, CERTIFICATE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Upstream errors can contain account data, credentials, or device identifiers.
    throw new Error("Unable to obtain EcoFlow MQTT certification");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// ─── Passive diagnostics ─────────────────────────────────────────────────────

/** A one-off listener only: no publishing, persistence, or collection scheduling. */
export const capture = internalAction({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args): Promise<MqttDiagnosticResult> => captureSession(ctx, args.deviceId, "diagnostic"),
});

/**
 * Prove that PD powers are advancing without requiring static metadata to be
 * repeated by a delta stream. The caller separately validates supported device
 * identity and source evidence before allocating the returned live powers.
 */
export const captureReading = internalAction({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args): Promise<MqttDiagnosticResult> => captureSession(ctx, args.deviceId, "collector"),
});

/** Wait independently for an explicit temperature in a progressing BMS report. */
export const captureTemperature = internalAction({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args): Promise<MqttDiagnosticResult> => captureSession(ctx, args.deviceId, "temperature"),
});

async function captureSession(ctx: ActionCtx, deviceId: Id<"devices">, purpose: "diagnostic" | "collector" | "temperature"): Promise<MqttDiagnosticResult> {
    const device = await ctx.runQuery(internal.devices_internal.getById, { deviceId });
    if (!device || !device.isActive) throw new Error("Active device not found");
    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;
    if (!accessKey || !secretKey) throw new Error("EcoFlow credentials not configured");
    const lease = { deviceId, purpose, token: randomUUID() };
    const claim = await ctx.runMutation(internal.devices_internal.claimMqttSession, lease);
    if (!claim.allowed) {
      const at = Date.now();
      return {
        reason: "capture_busy", startedAt: at, finishedAt: at,
        connected: false, subscribed: false, receivedMessages: 0, receivedBytes: 0,
        rejectedFrames: 0, duplicateFrames: 0, retainedFrames: 0, liveFrames: 0, frames: [],
        envelopeCounts: { paramsObject: 0, dataObject: 0, otherObject: 0, nonObject: 0, malformedJson: 0 },
        moduleCounts: { pd: 0, inv: 0, mppt: 0, bms: 0, ems: 0, other: 0 },
      };
    }
    try {
    const certificate = await getCertification(accessKey, secretKey);
    // The public broker limits distinct client IDs. Reuse a privacy-safe ID for
    // each leased device/purpose rather than inventing one on every collection.
    const clientId = `eco-${createHash("sha256").update(JSON.stringify([
      "my-ecoflow", certificate.username, deviceId, purpose,
    ])).digest("hex").slice(0, 19)}`;
    const topic = `/open/${certificate.username}/${device.deviceSn}/quota`;
    // The internal device identity is still checked before constructing a subscription.
    if (!device.deviceSn || /[\/#\u0000+]/.test(device.deviceSn)) throw new Error("Invalid device identity");
    const startedAt = Date.now();
    let freshTemperature: { value: number; receivedAt: number } | undefined;
    const captured = await new Promise<MqttDiagnosticResult>((resolve) => {
      const result: MqttDiagnosticResult = {
        reason: "deadline", startedAt, finishedAt: startedAt,
        connected: false, subscribed: false, receivedMessages: 0, receivedBytes: 0,
        rejectedFrames: 0, duplicateFrames: 0, retainedFrames: 0, liveFrames: 0, frames: [],
        envelopeCounts: { paramsObject: 0, dataObject: 0, otherObject: 0, nonObject: 0, malformedJson: 0 },
        moduleCounts: { pd: 0, inv: 0, mppt: 0, bms: 0, ems: 0, other: 0 },
      };
      const seen = new Set<string>();
      let latestPdClock: number | null = null;
      let latestBmsClock: number | null = null;
      let totalPowerPdReports = 0;
      let pdContinuityPoisoned = false;
      let selectedPdTotals: DiagnosticFrame | undefined;
      let solarGrace: ReturnType<typeof setTimeout> | undefined;
      let client: MqttClient | undefined;
      let finished = false;
      const deadline = setTimeout(() => finish("deadline"), purpose === "temperature" ? TEMPERATURE_DEADLINE_MS : MQTT_DEADLINE_MS);

      const detach = () => {
        client?.removeListener("connect", onConnect);
        client?.removeListener("message", onMessage);
        client?.removeListener("error", onError);
        client?.removeListener("close", onClose);
      };
      function finish(reason: StopReason) {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        clearTimeout(solarGrace);
        // The existing session deadline also bounds the optional companion
        // wait. Already-proven recent totals survive that shortened grace.
        result.reason = reason === "deadline" && purpose === "collector" &&
          !pdContinuityPoisoned && totalPowerPdReports >= 2 && selectedPdTotals && Date.now() - selectedPdTotals.receivedAt <= MAX_READY_TOTAL_AGE_MS
          ? "measurement_ready" : reason;
        result.finishedAt = Date.now();
        if (!client) { resolve(result); return; }
        // Bound cleanup too; a broken broker must not leave a socket or timer behind.
        let closed = false;
        const done = () => {
          if (closed) return;
          closed = true;
          clearTimeout(closeTimeout);
          detach();
          resolve(result);
        };
        const closeTimeout = setTimeout(() => { client?.stream.destroy(); done(); }, CLOSE_TIMEOUT_MS);
        try { client.end(true, {}, done); } catch { client.stream.destroy(); done(); }
      }
      function onConnect() {
        if (finished || !client) return;
        result.connected = true;
        // Exact owned-device topic only; no wildcards or application publications.
        client.subscribe(topic, { qos: 0 }, (error, grants) => {
          if (finished) return;
          if (error || !grants?.some((grant) => grant.topic === topic && grant.qos === 0)) {
            finish("subscription_error");
          } else result.subscribed = true;
        });
      }
      function onError() { finish("connection_error"); }
      function onClose() { finish("connection_closed"); }
      function onMessage(receivedTopic: string, bytes: Buffer, packet: IPublishPacket) {
        if (finished) return;
        result.receivedMessages++;
        result.receivedBytes += bytes.length;
        if (result.receivedBytes > (purpose === "temperature" ? TEMPERATURE_BYTE_LIMIT : BYTE_LIMIT)) { finish("byte_limit"); return; }
        if (receivedTopic !== topic || !result.subscribed) result.rejectedFrames++;
        else {
          let payload: unknown;
          try {
            payload = JSON.parse(bytes.toString("utf8"));
            if (!isObject(payload)) result.envelopeCounts.nonObject++;
            else {
              if (isObject(payload.params)) result.envelopeCounts.paramsObject++;
              else if (isObject(payload.data)) result.envelopeCounts.dataObject++;
              else result.envelopeCounts.otherObject++;
              if (payload.moduleType === 1) result.moduleCounts.pd++;
              else if (payload.moduleType === 3) result.moduleCounts.inv++;
              else if (payload.moduleType === 5) result.moduleCounts.mppt++;
              else if (payload.moduleType === 2 && payload.typeCode === "bmsStatus") result.moduleCounts.bms++;
              else if (payload.moduleType === 2 && payload.typeCode === "emsStatus") result.moduleCounts.ems++;
              else result.moduleCounts.other++;
            }
          } catch { payload = null; result.envelopeCounts.malformedJson++; }
          const frame = sanitizeQuotaFrame(payload, Date.now(), { retained: packet.retain === true, duplicate: packet.dup === true });
          if (!frame) result.rejectedFrames++;
          else {
            const key = JSON.stringify([frame.module, frame.moduleTime, frame.id, frame.values]);
            const repeated = packet.dup === true || seen.has(key);
            seen.add(key);
            if (repeated) { frame.duplicate = true; result.duplicateFrames++; }
            else if (frame.retained) result.retainedFrames++;
            else result.liveFrames++;
            result.frames.push(frame);
            if (purpose === "temperature" && frame.module === "bms" && !frame.retained && !repeated &&
              frame.moduleTime !== null && frame.moduleTime >= 0 &&
              (latestBmsClock === null || frame.moduleTime > latestBmsClock)) {
              const progressed = latestBmsClock !== null;
              latestBmsClock = frame.moduleTime;
              // A connection's initial snapshot alone is not a new measurement.
              // Never substitute cell/MOS temperatures or merge temp from an old packet.
              if (progressed && Number.isFinite(frame.values.temp)) {
                freshTemperature = { value: frame.values.temp, receivedAt: frame.receivedAt };
                finish("temperature_ready");
              }
            }
            if (purpose === "collector" && frame.module === "pd" && !frame.retained && !repeated &&
              frame.moduleTime !== null && frame.moduleTime >= 0 && !pdContinuityPoisoned) {
              if (latestPdClock !== null && frame.moduleTime <= latestPdClock) {
                if (frame.moduleTime < latestPdClock || hasPdPowerOrSourceFields(frame.values)) {
                  pdContinuityPoisoned = true;
                  selectedPdTotals = undefined;
                }
              } else {
                latestPdClock = frame.moduleTime;
                // Aggregate power liveness is independent of AC branch reporting.
                // Both totals must occur together in each qualifying report; this
                // never fills omitted source channels from an earlier packet.
                const totalsPresent = ["wattsInSum", "wattsOutSum"].every(field =>
                  Number.isFinite(frame.values[field]) && frame.values[field] >= 0
                );
                if (totalsPresent) {
                  totalPowerPdReports++;
                  selectedPdTotals = frame;
                } else if (hasPdPowerOrSourceFields(frame.values)) {
                  selectedPdTotals = undefined;
                }
              }
            }
            if (purpose === "collector" && !pdContinuityPoisoned && totalPowerPdReports >= 2 && selectedPdTotals) {
              const fullSourcePacket = Number.isFinite(selectedPdTotals.values.inputWatts) && selectedPdTotals.values.inputWatts >= 0;
              const panel = selectSolarPanelTelemetry({ ...result, finishedAt: Date.now() }, selectedPdTotals.receivedAt);
              if (fullSourcePacket || panel) finish("measurement_ready");
              else if (!solarGrace) {
                solarGrace = setTimeout(() => {
                  if (!pdContinuityPoisoned && selectedPdTotals && Date.now() - selectedPdTotals.receivedAt <= MAX_READY_TOTAL_AGE_MS) finish("measurement_ready");
                  else finish("deadline");
                }, SOLAR_COMPANION_GRACE_MS);
              }
            }
          }
        }
        // Bound malformed/duplicate messages as well as accepted diagnostic frames.
        if (result.receivedMessages >= (purpose === "temperature" ? TEMPERATURE_FRAME_LIMIT : FRAME_LIMIT)) finish("frame_limit");
      }
      try {
        client = connect({
          protocol: "mqtts", host: certificate.host, port: 8883,
          username: certificate.username, password: certificate.password,
          clientId,
          protocolVersion: 4, clean: true, reconnectPeriod: 0, resubscribe: false,
          connectTimeout: 5_000, keepalive: 15, rejectUnauthorized: true,
          manualConnect: true,
        });
        client.on("connect", onConnect);
        client.on("message", onMessage);
        client.on("error", onError);
        client.on("close", onClose);
        client.connect();
      } catch { finish("connection_error"); }
    });
    if (captured.reason === "temperature_ready" && freshTemperature) {
      await ctx.runMutation(internal.devices_internal.recordTemperatureObservation, {
        deviceId,
        temperature: freshTemperature.value,
        receivedAt: freshTemperature.receivedAt,
        leaseToken: lease.token,
      });
    }
    return captured;
    } finally {
      try { await ctx.runMutation(internal.devices_internal.releaseMqttSession, lease); }
      catch { throw new Error("Unable to release EcoFlow MQTT session"); }
    }
}
