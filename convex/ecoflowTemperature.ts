"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { generateSignature } from "./ecoflow";
import type { MqttDiagnosticResult } from "./ecoflowMqttDiagnostics";

const TEMPERATURE_QUOTAS = [
  "bms_bmsStatus.temp", "bms_bmsStatus.minCellTemp", "bms_bmsStatus.maxCellTemp",
  "bms_bmsStatus.minMosTemp", "bms_bmsStatus.maxMosTemp",
] as const;
const READ_DELAY_MS = 5_000;
const REQUEST_TIMEOUT_MS = 15_000;

type TemperatureKey = typeof TEMPERATURE_QUOTAS[number];
interface TemperatureRead {
  status: "ok" | "request_failed" | "invalid_response" | "timeout";
  requestStartedAt: number;
  responseReceivedAt: number | null;
  httpStatus: number | null;
  apiCode: number | null;
  temperatures: Partial<Record<TemperatureKey, number>>;
}
export interface TemperatureInspection extends TemperatureRead {
  captureStatus: "completed" | "failed";
  capture: MqttDiagnosticResult | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Selected reads can contain numeric strings; never return arbitrary API fields. */
export function sanitizeTemperatures(data: unknown): Partial<Record<TemperatureKey, number>> {
  const temperatures: Partial<Record<TemperatureKey, number>> = {};
  if (!isObject(data)) return temperatures;
  for (const field of TEMPERATURE_QUOTAS) {
    const value = data[field];
    if (typeof value !== "number" && typeof value !== "string") continue;
    if (typeof value === "string" && value.trim() === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) temperatures[field] = number;
  }
  return temperatures;
}

async function readTemperatures(deviceSn: string, accessKey: string, secretKey: string): Promise<TemperatureRead> {
  const requestStartedAt = Date.now();
  const controller = new AbortController();
  const result: TemperatureRead = { status: "request_failed", requestStartedAt, responseReceivedAt: null, httpStatus: null, apiCode: null, temperatures: {} };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const nonce = Math.floor(100_000 + Math.random() * 900_000).toString();
    // Unlike quota/all's special case, a selected POST signs the complete body.
    const parameters: Record<string, string> = { sn: deviceSn };
    TEMPERATURE_QUOTAS.forEach((field, index) => { parameters[`params.quotas[${index}]`] = field; });
    const sign = generateSignature(secretKey, accessKey, parameters, requestStartedAt, nonce);
    const request = (async (): Promise<TemperatureRead> => {
      const response = await fetch("https://api-e.ecoflow.com/iot-open/sign/device/quota", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json;charset=UTF-8", accessKey, nonce, timestamp: requestStartedAt.toString(), sign },
        body: JSON.stringify({ sn: deviceSn, params: { quotas: TEMPERATURE_QUOTAS } }),
      });
      result.httpStatus = response.status;
      if (!response.ok) return { ...result, responseReceivedAt: Date.now() };
      const payload: unknown = await response.json();
      const responseReceivedAt = Date.now();
      if (isObject(payload)) {
        const code = String(payload.code);
        if (/^[0-9-]{1,12}$/.test(code) && Number.isSafeInteger(Number(code))) result.apiCode = Number(code);
      }
      if (!isObject(payload) || String(payload.code) !== "0" || !isObject(payload.data)) {
        return { ...result, status: "invalid_response", responseReceivedAt };
      }
      return { ...result, status: "ok", responseReceivedAt, temperatures: sanitizeTemperatures(payload.data) };
    })();
    return await Promise.race([
      request,
      new Promise<TemperatureRead>(resolve => {
        timer = setTimeout(() => {
          controller.abort();
          resolve({ ...result, status: "timeout" });
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Never propagate upstream bodies/errors that can contain credentials or SNs.
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── Controlled read-only diagnostics ────────────────────────────────────────

/** A successful read is not itself proof of a current physical measurement. */
export const inspect = internalAction({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args): Promise<TemperatureInspection> => {
    const device = await ctx.runQuery(internal.devices_internal.getById, { deviceId: args.deviceId });
    if (!device || !device.isActive) throw new Error("Active device not found");
    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;
    if (!accessKey || !secretKey) throw new Error("EcoFlow credentials not configured");
    // Attach rejection handling immediately while the fixed delay/POST runs.
    const capture = ctx.runAction(internal.ecoflowMqttDiagnostics.capture, { deviceId: args.deviceId })
      .then(value => ({ captureStatus: "completed" as const, capture: value }))
      .catch(() => ({ captureStatus: "failed" as const, capture: null }));
    await new Promise<void>(resolve => setTimeout(resolve, READ_DELAY_MS));
    const [read, evidence] = await Promise.all([readTemperatures(device.deviceSn, accessKey, secretKey), capture]);
    return { ...read, ...evidence };
  },
});
