"use node";

import { createHash, randomUUID } from "node:crypto";
import { connect, type MqttClient, type IPublishPacket } from "mqtt";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { getCertification, sanitizeQuotaFrame, type DiagnosticFrame } from "./ecoflowMqttDiagnostics";
import { sanitizeTemperatures } from "./ecoflowTemperature";

const QUOTAS = [
  "bms_bmsStatus.temp", "bms_bmsStatus.minCellTemp", "bms_bmsStatus.maxCellTemp",
  "bms_bmsStatus.minMosTemp", "bms_bmsStatus.maxMosTemp",
] as const;
const DEADLINE_MS = 20_000;
const READ_DELAY_MS = 5_000;
const CLOSE_TIMEOUT_MS = 500;
const MESSAGE_LIMIT = 50;
const BYTE_LIMIT = 64 * 1024;
const QUOTA_ONLY_DEADLINE_MS = 60_000;
const QUOTA_ONLY_MESSAGE_LIMIT = 120;
const QUOTA_ONLY_BYTE_LIMIT = 128 * 1024;

type StopReason = "deadline" | "capture_busy" | "frame_limit" | "byte_limit" |
  "connection_error" | "subscription_error" | "connection_closed" | "publish_error";
type QuotaEvidence = Omit<DiagnosticFrame, "id">;
interface ReplyEvidence {
  receivedAt: number;
  code: number | null;
  moduleTime: number | null;
  temperatures: ReturnType<typeof sanitizeTemperatures>;
}
export interface TemperatureMqttGetResult {
  reason: StopReason;
  startedAt: number;
  finishedAt: number;
  connected: boolean;
  subscribed: boolean;
  subscriptions: {
    quota: number | null; getReply: number | null; unknownTopicCount: number; callbackError: boolean;
    callbackErrorCode: number | null;
    actualAck: { quota: number | null; getReply: number | null; length: number | null };
  };
  requestPublishedAt: number | null;
  publishAcceptedAt: number | null;
  baselineAt: number | null;
  baselineClock: number | null;
  receivedMessages: number;
  receivedBytes: number;
  rejectedMessages: number;
  ignoredReplies: number;
  frames: QuotaEvidence[];
  replies: ReplyEvidence[];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function protocolCode(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
}

function matchesRequestId(value: unknown, requestId: string): boolean {
  if (typeof value === "string") return value === requestId;
  // Public MQTT examples echo decimal string IDs as numbers. Do not round,
  // trim, or otherwise coerce an unsafe or noncanonical correlation value.
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 &&
    !Object.is(value, -0) && String(value) === requestId;
}

/** Correlation proves which read was answered, not a fresh physical sensor sample. */
export function sanitizeTemperatureGetReply(payload: unknown, requestId: string, receivedAt: number): ReplyEvidence | null {
  if (!object(payload) || !matchesRequestId(payload.id, requestId) || !Number.isFinite(receivedAt)) return null;
  const rawCode = typeof payload.code === "number" || typeof payload.code === "string" ? String(payload.code) : "";
  const code = /^-?\d{1,11}$/.test(rawCode) && Number.isSafeInteger(Number(rawCode)) ? Number(rawCode) : null;
  return {
    receivedAt, code,
    moduleTime: typeof payload.time === "number" && Number.isFinite(payload.time) ? payload.time : null,
    temperatures: sanitizeTemperatures(payload.data),
  };
}

// ─── Fixed read-only public MQTT probe ────────────────────────────────────────

/**
 * One public GET publication, never SET. Keep reply and passive quota evidence
 * separate: a cloud reply does not establish a newly measured temperature.
 */
export const inspect = internalAction({
  args: { deviceId: v.id("devices"), allowQuotaOnly: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<TemperatureMqttGetResult> => {
    const device = await ctx.runQuery(internal.devices_internal.getById, { deviceId: args.deviceId });
    if (!device || !device.isActive) throw new Error("Active device not found");
    if (!device.deviceSn || /[\/#\u0000+]/.test(device.deviceSn)) throw new Error("Invalid device identity");
    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;
    if (!accessKey || !secretKey) throw new Error("EcoFlow credentials not configured");
    const lease = { deviceId: args.deviceId, purpose: "diagnostic" as const, token: randomUUID() };
    const initial = (): TemperatureMqttGetResult => ({
      reason: "deadline", startedAt: Date.now(), finishedAt: Date.now(),
      connected: false, subscribed: false, requestPublishedAt: null, publishAcceptedAt: null,
      baselineAt: null, baselineClock: null,
      subscriptions: { quota: null, getReply: null, unknownTopicCount: 0, callbackError: false,
        callbackErrorCode: null, actualAck: { quota: null, getReply: null, length: null } },
      receivedMessages: 0, receivedBytes: 0, rejectedMessages: 0, ignoredReplies: 0, frames: [], replies: [],
    });
    const claim = await ctx.runMutation(internal.devices_internal.claimMqttSession, lease);
    if (!claim.allowed) return { ...initial(), reason: "capture_busy" };
    try {
      const certificate = await getCertification(accessKey, secretKey);
      // Share the already leased diagnostic identity; do not consume another
      // account-level MQTT client ID or collide with a passive diagnostic.
      const clientId = `eco-${createHash("sha256").update(JSON.stringify([
        "my-ecoflow", certificate.username, args.deviceId, "diagnostic",
      ])).digest("hex").slice(0, 19)}`;
      const prefix = `/open/${certificate.username}/${device.deviceSn}`;
      const quotaTopic = `${prefix}/quota`;
      const replyTopic = `${prefix}/get_reply`;
      const getTopic = `${prefix}/get`;
      const requestId = String(Date.now());
      return await new Promise<TemperatureMqttGetResult>(resolve => {
        const result = initial();
        const seenFrames = new Set<string>();
        const seenReplies = new Set<string>();
        let client: MqttClient | undefined;
        let finished = false;
        let readTimer: ReturnType<typeof setTimeout> | undefined;
        let readEligibleAt: number | null = null;
        const deadline = setTimeout(() => finish("deadline"), args.allowQuotaOnly ? QUOTA_ONLY_DEADLINE_MS : DEADLINE_MS);
        function detach() {
          client?.removeListener("connect", onConnect);
          client?.removeListener("message", onMessage);
          client?.removeListener("error", onError);
          client?.removeListener("close", onClose);
        }
        function finish(reason: StopReason) {
          if (finished) return;
          finished = true;
          clearTimeout(deadline);
          if (readTimer) clearTimeout(readTimer);
          result.reason = reason;
          result.finishedAt = Date.now();
          if (!client) { resolve(result); return; }
          let closed = false;
          const done = () => {
            if (closed) return;
            closed = true;
            clearTimeout(closeTimer);
            detach();
            resolve(result);
          };
          const closeTimer = setTimeout(() => { client?.stream.destroy(); done(); }, CLOSE_TIMEOUT_MS);
          try { client.end(true, {}, done); } catch { client.stream.destroy(); done(); }
        }
        function onError() { finish("connection_error"); }
        function onClose() { finish("connection_closed"); }
        function publishFixedRead() {
          if (finished || !client || !result.subscribed || result.requestPublishedAt !== null ||
            readEligibleAt === null || Date.now() < readEligibleAt) return;
          if (args.allowQuotaOnly && result.baselineAt === null) return;
          result.requestPublishedAt = Date.now();
          try {
            client.publish(getTopic, JSON.stringify({ id: requestId, version: "1.0", from: "Web", params: { quotas: QUOTAS } }),
              { qos: 0, retain: false }, error => {
                if (finished) return;
                if (error) finish("publish_error");
                else result.publishAcceptedAt = Date.now();
              });
          } catch { finish("publish_error"); }
        }
        function onConnect() {
          if (finished || !client || result.connected) return;
          result.connected = true;
          client.subscribe([quotaTopic, replyTopic], { qos: 0 }, (error, grants, packet) => {
            if (finished || result.subscribed) return;
            const grantCode = (topic: string) => {
              const code = grants?.find(grant => grant.topic === topic)?.qos;
              return protocolCode(code);
            };
            // On failure MQTT.js leaves granted topic objects at the requested
            // QoS; only the actual SUBACK packet contains broker return codes.
            const ack = object(packet) && Array.isArray(packet.granted) ? packet.granted : null;
            result.subscriptions = {
              quota: grantCode(quotaTopic), getReply: grantCode(replyTopic),
              unknownTopicCount: grants?.filter(grant => grant.topic !== quotaTopic && grant.topic !== replyTopic).length ?? 0,
              callbackError: Boolean(error),
              callbackErrorCode: object(error) ? protocolCode(error.code) : null,
              actualAck: { quota: protocolCode(ack?.[0]), getReply: protocolCode(ack?.[1]), length: ack?.length ?? null },
            };
            const accepted = args.allowQuotaOnly
              // A denied reply subscription does not decide publication rights
              // on the distinct, documented read-only GET topic.
              ? ack?.length === 2 && ack[0] === 0
              : !error && ack?.length === 2 && ack[0] === 0 && ack[1] === 0 &&
                [quotaTopic, replyTopic].every(topic => grants?.some(grant => grant.topic === topic && grant.qos === 0));
            if (!accepted) {
              finish("subscription_error"); return;
            }
            result.subscribed = true;
            readEligibleAt = Date.now() + READ_DELAY_MS;
            readTimer = setTimeout(publishFixedRead, READ_DELAY_MS);
          });
        }
        function onMessage(topic: string, bytes: Buffer, packet: IPublishPacket) {
          if (finished) return;
          result.receivedMessages++;
          result.receivedBytes += bytes.length;
          if (result.receivedBytes > (args.allowQuotaOnly ? QUOTA_ONLY_BYTE_LIMIT : BYTE_LIMIT)) { finish("byte_limit"); return; }
          let payload: unknown;
          try { payload = JSON.parse(bytes.toString("utf8")); } catch { payload = null; }
          if (!result.subscribed || (topic !== quotaTopic && topic !== replyTopic)) result.rejectedMessages++;
          else if (topic === replyTopic) {
            const reply = result.requestPublishedAt !== null && !packet.retain && !packet.dup
              ? sanitizeTemperatureGetReply(payload, requestId, Date.now()) : null;
            const key = reply && JSON.stringify([reply.code, reply.moduleTime, reply.temperatures]);
            if (!reply || !key || seenReplies.has(key)) result.ignoredReplies++;
            else { seenReplies.add(key); result.replies.push(reply); }
          } else {
            const frame = sanitizeQuotaFrame(payload, Date.now(), { retained: packet.retain === true, duplicate: packet.dup === true });
            if (!frame) result.rejectedMessages++;
            else {
              const key = JSON.stringify([frame.module, frame.moduleTime, frame.id, frame.values]);
              if (seenFrames.has(key)) frame.duplicate = true;
              seenFrames.add(key);
              const { id, ...evidence } = frame;
              void id;
              result.frames.push(evidence);
              if (frame.module === "bms" && !frame.retained && !frame.duplicate &&
                frame.moduleTime !== null && frame.moduleTime >= 0 && result.baselineAt === null) {
                result.baselineAt = frame.receivedAt;
                result.baselineClock = frame.moduleTime;
                if (args.allowQuotaOnly) publishFixedRead();
              }
            }
          }
          if (result.receivedMessages >= (args.allowQuotaOnly ? QUOTA_ONLY_MESSAGE_LIMIT : MESSAGE_LIMIT)) finish("frame_limit");
        }
        try {
          client = connect({ protocol: "mqtts", host: certificate.host, port: 8883,
            username: certificate.username, password: certificate.password, clientId,
            protocolVersion: 4, clean: true, reconnectPeriod: 0, resubscribe: false,
            connectTimeout: 5_000, keepalive: 15, rejectUnauthorized: true, manualConnect: true });
          client.on("connect", onConnect);
          client.on("message", onMessage);
          client.on("error", onError);
          client.on("close", onClose);
          client.connect();
        } catch { finish("connection_error"); }
      });
    } finally {
      try { await ctx.runMutation(internal.devices_internal.releaseMqttSession, lease); }
      catch { throw new Error("Unable to release EcoFlow MQTT session"); }
    }
  },
});
