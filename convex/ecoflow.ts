"use node";

import { internalAction, action } from "./_generated/server";
import { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import crypto from "crypto";
import { auth } from "./auth";
import type { ChargingTypeSource, DcInputSource, InputMeasurement, InputQuality } from "./readingQuality";
import type { DiagnosticFrame, MqttDiagnosticResult } from "./ecoflowMqttDiagnostics";
import type { DisplayTelemetry } from "./displayTelemetry";
import { selectSolarPanelTelemetry } from "./solarPanelTelemetry";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EcoFlowDevice {
  sn: string;
  productType: string;
  productName: string;
  online: number;
  status: string;
}

interface APIResponse<T = Record<string, unknown>> {
  code: string;
  message: string;
  data: T;
}

// ─── EcoFlow API Helpers (ported from src/lib/ecoflow-api.ts) ────────────────

const GET_TIMEOUT_MS = 15_000;

async function fetchEcoFlowJson<T>(
  url: string,
  options: RequestInit
): Promise<APIResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GET_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`EcoFlow API HTTP ${response.status}`);
    }
    const data: APIResponse<T> = await response.json();
    if (!data || data.code !== "0") {
      // Upstream messages may contain the serial or echoed request details.
      throw new Error("EcoFlow API returned an unsuccessful response");
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("EcoFlow API request timed out");
    if (error instanceof Error && error.message.startsWith("EcoFlow API ")) throw error;
    throw new Error("EcoFlow API request failed");
  } finally {
    clearTimeout(timeout);
  }
}

export function generateSignature(
  secretKey: string,
  accessKey: string,
  params: Record<string, string | number>,
  timestamp: number,
  nonce: string
): string {
  // Per EcoFlow docs: sort request params alphabetically first,
  // then append accessKey, nonce, timestamp at the end (fixed order).
  const sortedRequestParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const authSuffix = `accessKey=${accessKey}&nonce=${nonce}&timestamp=${timestamp}`;
  const signatureString = sortedRequestParams
    ? `${sortedRequestParams}&${authSuffix}`
    : authSuffix;

  return crypto
    .createHmac("sha256", secretKey)
    .update(signatureString)
    .digest("hex");
}

async function makeEcoFlowRequest<T = Record<string, unknown>>(
  accessKey: string,
  secretKey: string,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  params: Record<string, string | number> = {}
): Promise<APIResponse<T>> {
  const baseURL = "https://api-e.ecoflow.com";
  const timestamp = Date.now();
  const nonce = Math.floor(100000 + Math.random() * 900000).toString();

  const signature = generateSignature(secretKey, accessKey, params, timestamp, nonce);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    accessKey,
    nonce,
    timestamp: timestamp.toString(),
    sign: signature,
  };

  const searchParams = new URLSearchParams();
  if (method === "GET" && Object.keys(params).length > 0) {
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, String(value));
    });
  }

  const url = searchParams.toString()
    ? `${baseURL}${endpoint}?${searchParams.toString()}`
    : `${baseURL}${endpoint}`;

  return fetchEcoFlowJson<T>(url, {
    method,
    headers,
  });
}

async function getDeviceList(
  accessKey: string,
  secretKey: string
): Promise<EcoFlowDevice[]> {
  const response = await makeEcoFlowRequest<EcoFlowDevice[]>(
    accessKey,
    secretKey,
    "/iot-open/sign/device/list"
  );
  if (!Array.isArray(response.data)) {
    throw new Error("EcoFlow API returned an invalid device list");
  }
  return response.data;
}

// ─── SET Command Helpers ─────────────────────────────────────────────────────

/**
 * Flatten a nested object into dot-separated key-value pairs for signature generation.
 * E.g. { sn: "X", params: { enabled: 1 } } → { "sn": "X", "params.enabled": "1" }
 */
export function flattenParams(
  obj: Record<string, unknown>,
  prefix = ""
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenParams(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}

/**
 * Send a PUT request to the EcoFlow SET quota endpoint.
 * Used for all 17 device control commands.
 */
async function setDeviceQuotaRequest(
  accessKey: string,
  secretKey: string,
  body: {
    sn: string;
    moduleType: number;
    operateType: string;
    params: Record<string, unknown>;
  }
): Promise<{ success: boolean; code: string; message: string }> {
  const baseURL = "https://api-e.ecoflow.com";
  const timestamp = Date.now();
  const nonce = Math.floor(100000 + Math.random() * 900000).toString();

  // Delta 2 requires id (message ID) and version (protocol version) in the body
  const fullBody = {
    id: timestamp,
    version: "1.0",
    ...body,
  };

  // PUT requests with JSON body: flatten body params into signature per EcoFlow docs
  const flatBody = flattenParams(fullBody as unknown as Record<string, unknown>);
  const signature = generateSignature(secretKey, accessKey, flatBody, timestamp, nonce);

  const response = await fetch(`${baseURL}/iot-open/sign/device/quota`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json;charset=UTF-8",
      accessKey,
      nonce,
      timestamp: timestamp.toString(),
      sign: signature,
    },
    body: JSON.stringify(fullBody),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`EcoFlow SET API HTTP ${response.status}: ${response.statusText} — ${responseText}`);
  }

  const data: APIResponse = JSON.parse(responseText);
  return {
    success: data.code === "0",
    code: data.code,
    message: data.message,
  };
}

async function getDeviceQuota(
  accessKey: string,
  secretKey: string,
  deviceSN: string
): Promise<Record<string, number | string> | null> {
  const baseURL = "https://api-e.ecoflow.com";
  const timestamp = Date.now();
  const nonce = Math.floor(100000 + Math.random() * 900000).toString();

  // Quota API signature excludes sn parameter
  const signature = generateSignature(secretKey, accessKey, {}, timestamp, nonce);

  const url = `${baseURL}/iot-open/sign/device/quota/all?sn=${encodeURIComponent(deviceSN)}`;

  const response = await fetchEcoFlowJson<Record<string, number | string>>(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      accessKey,
      nonce,
      timestamp: timestamp.toString(),
      sign: signature,
    },
  });

  const data = response.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data;
}

function getQuotaValue(
  data: Record<string, number | string>,
  key: string
): number | null {
  const value = data[key];
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(num) ? num : null;
}

function getQuotaPower(data: Record<string, number | string>, key: string) {
  const value = getQuotaValue(data, key);
  return value !== null && value >= 0 ? value : null;
}

function sumQuotaPowers(powers: Array<number | null>): number | null {
  if (powers.some((power) => power === null)) return null;
  const sum = powers.reduce<number>((total, power) => total + (power ?? 0), 0);
  return Number.isFinite(sum) ? sum : null;
}

export function transformQuotaToReading(
  data: Record<string, number | string>,
  options: { dcInputSource?: DcInputSource } = {},
) {
  // === INPUT POWER ===
  const reportedAcInput = getQuotaPower(data, "inv.inputWatts");
  const reportedDcInput = getQuotaPower(data, "mppt.inWatts");
  const aggregateInput = getQuotaPower(data, "pd.wattsInSum");
  let totalInput = aggregateInput ?? sumQuotaPowers([reportedAcInput, reportedDcInput]);
  // Quota fields come from separate modules. A coherent snapshot is evidence of
  // agreement only, not a documented device measurement timestamp. Allow small
  // rounding/asynchronous update differences; never rescale contradictory watts.
  let inputQuality: InputQuality = "incomplete";
  if (aggregateInput !== null && reportedAcInput !== null && reportedDcInput !== null) {
    const difference = Math.abs(reportedAcInput + reportedDcInput - aggregateInput);
    const tolerance = Math.max(10, aggregateInput * 0.05);
    inputQuality = aggregateInput === 0
      ? (reportedAcInput === 0 && reportedDcInput === 0 ? "consistent" : "inconsistent")
      : (difference <= tolerance ? "consistent" : "inconsistent");
  }
  let acInputWatts = aggregateInput === 0 ? 0 : reportedAcInput ?? undefined;
  let dcInputWatts = aggregateInput === 0 ? 0 : reportedDcInput ?? undefined;
  let chgType = getQuotaValue(data, "mppt.chgType");
  let solarInputWatts: number | undefined;
  let chargingTypeSource: ChargingTypeSource | undefined;
  let inputMeasurement: InputMeasurement | undefined = "legacy-modules";

  // Observed DELTA 2 model 80 PD frames (sysVer 16908850) report AC input and
  // aggregate input together, in watts. pd.inputWatts/pd.chargerType are not
  // specified in the checked-in HTTP field reference: live MQTT frames and
  // retained source-transition evidence establish this model's mapping.
  // INV charging/output values are separate asynchronous measurements and
  // cannot serve as this PD frame's AC contribution. No guessed scale factor
  // or source mapping is applied to other models. Provenance is forward-only.
  const pdAcInput = getQuotaPower(data, "pd.inputWatts");
  if (getQuotaValue(data, "pd.model") === 80) {
    const supportedFirmware = getQuotaValue(data, "pd.sysVer") === 16908850;
    inputMeasurement = supportedFirmware ? "delta2-pd-v1" : undefined;
    totalInput = aggregateInput;
    acInputWatts = pdAcInput ?? undefined;
    dcInputWatts = undefined;
    chgType = null;
    inputQuality = "incomplete";
    // An identified model must not silently return to the faulty INV mapping
    // when PD fields are missing or malformed.
    if (supportedFirmware && aggregateInput !== null && pdAcInput !== null) {
      dcInputWatts = Math.max(0, aggregateInput - pdAcInput);
      const pdChargerType = getQuotaValue(data, "pd.chargerType");
      const liveDcType = pdChargerType === 1 || pdChargerType === 2 ? pdChargerType : null;
      const configuredDcType = options.dcInputSource === "solar" ? 2 : options.dcInputSource === "adapter" ? 1 : null;
      const sourceMismatch = dcInputWatts > 0 && liveDcType !== null && configuredDcType !== null &&
        liveDcType !== configuredDcType;
      // PD's observed DC-source enum is separate from INV's charger enum.
      chgType = dcInputWatts > 0 && !sourceMismatch
        ? liveDcType ?? configuredDcType
        : dcInputWatts === 0 ? (pdAcInput > 0 ? 3 : 0) : null;
      if (dcInputWatts > 0 && chgType !== null) {
        chargingTypeSource = liveDcType !== null ? "live-pd" : "device-setting";
      }
      const tolerance = Math.max(10, aggregateInput * 0.05);
      if ((aggregateInput === 0 && pdAcInput > 0) || pdAcInput > aggregateInput + tolerance) {
        // Retain the reported AC channel as evidence; do not replace it with
        // zero or fall back to a stale INV channel to conceal a PD conflict.
        inputQuality = "inconsistent";
      } else if (sourceMismatch) {
        inputQuality = "inconsistent";
      } else if (dcInputWatts === 0) {
        inputQuality = "consistent";
        solarInputWatts = 0;
      } else if (pdAcInput === 0) {
        // PD still identifies the input as DC when the subtype is unknown;
        // leave chargingType/solar absent so it cannot be called solar or zero.
        inputQuality = "consistent";
        solarInputWatts = chgType === 2 ? dcInputWatts : chgType === 1 ? 0 : undefined;
      } else {
        // Mixed-input splits are not validated by the exclusive-source
        // observations; keep their allocation uncertain.
        inputQuality = "incomplete";
      }
    }
  }

  // === OUTPUT POWER ===
  let acOutputWatts = getQuotaPower(data, "inv.outputWatts");
  const dcOutputWatts = getQuotaPower(data, "pd.carWatts");
  const usbPowers = ["pd.usb1Watts", "pd.usb2Watts", "pd.typec1Watts",
    "pd.typec2Watts", "pd.qcUsb1Watts", "pd.qcUsb2Watts"]
    .map((key) => getQuotaPower(data, key));
  let usbOutputWatts = sumQuotaPowers(usbPowers);
  const supportedPdOutput = getQuotaValue(data, "pd.model") === 80 &&
    getQuotaValue(data, "pd.sysVer") === 16908850;
  const aggregateOutput =
    getQuotaPower(data, "pd.wattsOutSum") ??
    (supportedPdOutput ? null : getQuotaPower(data, "pd.outputWatts"));
  if (supportedPdOutput) {
    // On this validated firmware, PD reports AC output, car/DC output and total
    // together. The residual includes USB ports omitted from delta-only updates.
    // INV output is independently updated and cannot complete this PD snapshot.
    acOutputWatts = getQuotaPower(data, "pd.outputWatts");
    usbOutputWatts = aggregateOutput !== null && acOutputWatts !== null && dcOutputWatts !== null &&
      acOutputWatts + dcOutputWatts <= aggregateOutput
      ? aggregateOutput - acOutputWatts - dcOutputWatts
      : null;
  }
  const totalOutput = aggregateOutput ?? sumQuotaPowers([acOutputWatts, dcOutputWatts, usbOutputWatts]);

  // === BATTERY & STATUS ===
  const reportedBattery = getQuotaValue(data, "bms_bmsStatus.soc");
  const batteryLevel = reportedBattery !== null && reportedBattery >= 0 && reportedBattery <= 100
    ? reportedBattery : null;
  const temperature = getQuotaValue(data, "bms_bmsStatus.temp");

  // remainingTime: prefer bms_emsStatus (precise minutes) over pd.remainTime (rounded by firmware).
  // Use pd.remainTime sign convention: positive=charging, negative=discharging.
  const chgRemain = getQuotaValue(data, "bms_emsStatus.chgRemainTime");
  const dsgRemain = getQuotaValue(data, "bms_emsStatus.dsgRemainTime");
  const pdRemain = getQuotaValue(data, "pd.remainTime");

  let remainingTime: number | null = null;

  // Determine charging vs discharging using NET power flow.
  // The device can simultaneously have input (e.g. solar) and output (e.g. loads),
  // so we must compare them. pd.remainTime sign is the authoritative signal from
  // the firmware since it already accounts for net power.
  const netPower = totalInput !== null && totalOutput !== null ? totalInput - totalOutput : 0;
  const hasPdRemainSign = pdRemain !== null && pdRemain !== 0;
  const isNetCharging = hasPdRemainSign
    ? pdRemain > 0             // firmware says charging (positive)
    : netPower > 10;           // fallback: net input exceeds output by >10W
  const isNetDischarging = hasPdRemainSign
    ? pdRemain < 0             // firmware says discharging (negative)
    : netPower < -10;          // fallback: net output exceeds input by >10W

  if (isNetCharging && chgRemain && chgRemain > 0) {
    remainingTime = chgRemain; // positive = time until full charge
  } else if (isNetDischarging && dsgRemain && dsgRemain > 0) {
    remainingTime = -dsgRemain; // negative = time until discharge
  } else if (pdRemain !== null && pdRemain !== 0) {
    remainingTime = pdRemain; // fallback to pd.remainTime (rounded but signed)
  } else {
    remainingTime = getQuotaValue(data, "bms_bmsStatus.remainTime");
  }

  // Status based on net power flow, not raw input/output
  let status = "standby";
  if (isNetCharging) status = "charging";
  else if (isNetDischarging) status = "discharging";
  else if ((batteryLevel ?? 0) > 95) status = "full";
  else if ((batteryLevel ?? 100) < 10) status = "low";

  return {
    batteryLevel: batteryLevel ?? undefined,
    inputWatts: totalInput ?? undefined,
    acInputWatts,
    dcInputWatts,
    inputQuality,
    inputMeasurement,
    chargingTypeSource,
    solarInputWatts,
    chargingType: chgType ?? undefined,
    outputWatts: totalOutput ?? undefined,
    acOutputWatts: aggregateOutput === 0 ? 0 : acOutputWatts ?? undefined,
    dcOutputWatts: aggregateOutput === 0 ? 0 : dcOutputWatts ?? undefined,
    usbOutputWatts: aggregateOutput === 0 ? 0 : usbOutputWatts ?? undefined,
    remainingTime: remainingTime ?? undefined,
    temperature: temperature ?? undefined,
    status,
    recordedAt: Date.now(),
    // === CONFIG STATE ===
    acEnabled: getQuotaValue(data, "mppt.cfgAcEnabled") === 1 ? true : getQuotaValue(data, "mppt.cfgAcEnabled") === 0 ? false : undefined,
    dcOutEnabled: getQuotaValue(data, "pd.dcOutState") === 1 ? true : getQuotaValue(data, "pd.dcOutState") === 0 ? false : undefined,
    carChargerEnabled: getQuotaValue(data, "mppt.carState") === 1 ? true : getQuotaValue(data, "mppt.carState") === 0 ? false : undefined,
    acXboost: getQuotaValue(data, "mppt.cfgAcXboost") === 1 ? true : getQuotaValue(data, "mppt.cfgAcXboost") === 0 ? false : undefined,
    acOutVoltage: getQuotaValue(data, "mppt.cfgAcOutVol") ?? undefined,
    acOutFrequency: getQuotaValue(data, "mppt.cfgAcOutFreq") ?? undefined,
    acChargingWatts: getQuotaValue(data, "mppt.cfgChgWatts") ?? undefined,
    acChargingPaused: getQuotaValue(data, "mppt.chgPauseFlag") === 1 ? true : getQuotaValue(data, "mppt.chgPauseFlag") === 0 ? false : undefined,
    dcChargingCurrent: getQuotaValue(data, "mppt.dcChgCurrent") ?? undefined,
    acStandbyMins: getQuotaValue(data, "mppt.acStandbyMins") ?? undefined,
    carStandbyMins: getQuotaValue(data, "mppt.carStandbyMin") ?? undefined,
    unitStandbyMins: getQuotaValue(data, "pd.standbyMin") ?? undefined,
    maxChargeSoc: getQuotaValue(data, "bms_emsStatus.maxChargeSoc") ?? undefined,
    minDischargeSoc: getQuotaValue(data, "bms_emsStatus.minDsgSoc") ?? undefined,
    solarPriority: getQuotaValue(data, "pd.pvChgPrioSet") === 1 ? true : getQuotaValue(data, "pd.pvChgPrioSet") === 0 ? false : undefined,
    energyMgmtEnabled: getQuotaValue(data, "pd.watchIsConfig") === 1 ? true : getQuotaValue(data, "pd.watchIsConfig") === 0 ? false : undefined,
    backupReserveSoc: getQuotaValue(data, "pd.bpPowerSoc") ?? undefined,
    acAutoOutEnabled: getQuotaValue(data, "pd.acAutoOutConfig") === 1 ? true : getQuotaValue(data, "pd.acAutoOutConfig") === 0 ? false : undefined,
    minAcOutSoc: getQuotaValue(data, "pd.minAcoutSoc") ?? undefined,
    smartGenOnSoc: getQuotaValue(data, "bms_emsStatus.minOpenOilEb") ?? undefined,
    smartGenOffSoc: getQuotaValue(data, "bms_emsStatus.maxCloseOilEb") ?? undefined,
    lcdOffSeconds: getQuotaValue(data, "pd.lcdOffSec") ?? undefined,
    buzzerSilent: getQuotaValue(data, "mppt.beepState") === 0 ? true : getQuotaValue(data, "mppt.beepState") === 1 ? false : undefined,
  };
}

interface OnlineSnapshot {
  onlineSerials: Set<string>;
  checkedAt: number;
}

async function getOnlineSnapshot(accessKey: string, secretKey: string): Promise<OnlineSnapshot> {
  const checkedAt = Date.now();
  const devices = await getDeviceList(accessKey, secretKey);
  return {
    onlineSerials: new Set(devices.filter((device) => device?.online === 1).map((device) => device.sn)),
    checkedAt,
  };
}

// PD delta reports can omit the AC branch even while both aggregate powers
// advance. Liveness does not establish availability of the source allocation.
const PD_TOTAL_POWERS = ["wattsInSum", "wattsOutSum"] as const;
// A later source/power delta invalidates an earlier selected power packet if it
// omits either total. Pure metadata updates do not make measured totals vanish.
const PD_POWER_OR_SOURCE_FIELDS = new Set(["wattsInSum", "wattsOutSum", "inputWatts", "outputWatts",
  "inWatts", "outWatts", "carWatts", "usb1Watts", "usb2Watts", "qcUsb1Watts", "qcUsb2Watts",
  "typec1Watts", "typec2Watts", "chargerType", "acChargeFlag", "redunChargeFlag", "chgDsgState"]);

export function hasPdPowerOrSourceFields(values: Record<string, number>) {
  return Object.keys(values).some(key => PD_POWER_OR_SOURCE_FIELDS.has(key));
}
const PD_SESSION_METADATA = ["model", "sysVer", "wifiVer", "chargerType", "soc", "remainTime",
  "chgDsgState", "acChargeFlag", "redunChargeFlag"] as const;
const PD_CONFIG_FIELDS = new Set(["dcOutState", "standbyMin", "pvChgPrioSet", "watchIsConfig",
  "bpPowerSoc", "acAutoOutConfig", "minAcoutSoc", "lcdOffSec", "model", "sysVer"]);

function hasLiveTotalPowers(frame: DiagnosticFrame) {
  return PD_TOTAL_POWERS.every((key) => Number.isFinite(frame.values[key]) && frame.values[key] >= 0);
}

/** A cached REST response must never be presented as a new physical capture. */
function selectLivePdMeasurement(result: MqttDiagnosticResult) {
  if (result.reason !== "measurement_ready" || !result.connected || !result.subscribed) {
    throw new Error("Fresh EcoFlow telemetry was not received");
  }
  let moduleTime = -Infinity;
  let receivedAt = -Infinity;
  let totalPowerFrames = 0;
  let pdContinuityPoisoned = false;
  let latest: DiagnosticFrame | undefined;
  const metadata: Record<string, number> = {};
  const modules = { bms: {} as Record<string, number>, ems: {} as Record<string, number> };
  const moduleClocks = { bms: -Infinity, ems: -Infinity };
  const moduleReceipts = { bms: -Infinity, ems: -Infinity };
  const fieldReceipts = { bms: {} as Record<string, number>, ems: {} as Record<string, number> };
  for (const frame of result.frames) {
    if (frame.retained || frame.duplicate || frame.moduleTime === null || !Number.isFinite(frame.moduleTime) || frame.moduleTime < 0 ||
      !Number.isFinite(frame.receivedAt) || frame.receivedAt < result.startedAt ||
      frame.receivedAt > result.finishedAt) continue;
    if (frame.module === "bms" || frame.module === "ems") {
      if (frame.moduleTime <= moduleClocks[frame.module] || frame.receivedAt < moduleReceipts[frame.module]) continue;
      moduleClocks[frame.module] = frame.moduleTime;
      moduleReceipts[frame.module] = frame.receivedAt;
      for (const [key, value] of Object.entries(frame.values)) {
        if (Number.isFinite(value)) {
          modules[frame.module][key] = value;
          fieldReceipts[frame.module][key] = frame.receivedAt;
        }
      }
    }
    if (frame.module !== "pd") continue;
    if (pdContinuityPoisoned) continue;
    if (frame.moduleTime <= moduleTime || frame.receivedAt < receivedAt) {
      // A reset/replay breaks this session's continuity. A later full packet
      // cannot reuse power proof or metadata from before that break.
      if (frame.moduleTime < moduleTime || hasPdPowerOrSourceFields(frame.values)) {
        pdContinuityPoisoned = true;
        latest = undefined;
      }
      continue;
    }
    moduleTime = frame.moduleTime;
    receivedAt = frame.receivedAt;
    for (const key of PD_SESSION_METADATA) {
      if (Number.isFinite(frame.values[key])) metadata[key] = frame.values[key];
    }
    if (hasLiveTotalPowers(frame)) {
      totalPowerFrames++;
      latest = frame;
    } else if (hasPdPowerOrSourceFields(frame.values)) {
      latest = undefined;
    }
  }
  if (pdContinuityPoisoned || totalPowerFrames < 2 || !latest || !hasLiveTotalPowers(latest)) {
    throw new Error("Fresh EcoFlow telemetry was not received");
  }
  return { latest, metadata, modules, fieldReceipts };
}

function overlayLivePdMeasurement(
  quota: Record<string, number | string>,
  live: ReturnType<typeof selectLivePdMeasurement>,
) {
  const merged = { ...quota };
  for (const key of Object.keys(merged)) {
    if (key.startsWith("pd.") && !PD_CONFIG_FIELDS.has(key.slice(3))) delete merged[key];
    if (key.startsWith("bms_bmsStatus.")) delete merged[key];
    if (key.startsWith("bms_emsStatus.") && !["maxChargeSoc", "minDsgSoc", "minOpenOilEb", "maxCloseOilEb"].includes(key.slice(14))) {
      delete merged[key];
    }
  }
  // REST is useful for configuration, but its independent cached modules are
  // not evidence of current power, SOC, or a precise remaining-time estimate.
  for (const key of ["inv.inputWatts", "inv.outputWatts", "mppt.inWatts", "mppt.chgType",
    "bms_bmsStatus.soc", "bms_bmsStatus.remainTime", "bms_emsStatus.chgRemainTime",
    "bms_emsStatus.dsgRemainTime"]) delete merged[key];
  for (const [key, value] of Object.entries({ ...live.metadata, ...live.latest.values })) {
    if (Number.isFinite(value)) merged[`pd.${key}`] = value;
  }
  // The power session can receive an initial BMS snapshot without proving that
  // its temperature advanced. Only the independent BMS observer records a new
  // generic temperature, at that report's own receipt rather than the PD time.
  for (const [key, value] of Object.entries(live.modules.bms)) {
    if (key !== "temp") merged[`bms_bmsStatus.${key}`] = value;
  }
  for (const [key, value] of Object.entries(live.modules.ems)) merged[`bms_emsStatus.${key}`] = value;
  if (live.metadata.soc !== undefined) merged["bms_bmsStatus.soc"] = live.metadata.soc;
  return merged;
}

/** Display-only fallback values never become newly measured historical samples. */
function buildDisplayTelemetry(
  quota: Record<string, number | string>,
  live: ReturnType<typeof selectLivePdMeasurement>,
  reading: ReturnType<typeof transformQuotaToReading>,
  fetchedAt: number,
): DisplayTelemetry {
  const cached = transformQuotaToReading(quota);
  const cachedUsb = sumQuotaPowers(["pd.usb1Watts", "pd.usb2Watts", "pd.typec1Watts",
    "pd.typec2Watts", "pd.qcUsb1Watts", "pd.qcUsb2Watts"].map((key) => getQuotaPower(quota, key)));
  cached.usbOutputWatts = cachedUsb ?? undefined;
  const telemetry: DisplayTelemetry = {};
  for (const field of ["acOutputWatts", "dcOutputWatts", "usbOutputWatts"] as const) {
    const value = cached[field];
    if (value !== undefined && Number.isFinite(value) && value >= 0) {
      telemetry[field] = { value, source: "rest-cache", receivedAt: fetchedAt };
    }
  }
  for (const field of ["acOutputWatts", "dcOutputWatts", "usbOutputWatts"] as const) {
    const value = reading[field];
    if (value !== undefined && Number.isFinite(value) && value >= 0) {
      telemetry[field] = { value, source: "mqtt", receivedAt: live.latest.receivedAt };
    }
  }
  return telemetry;
}

/** All reading paths must pass this liveness/quality gate, including post-SET. */
async function captureDeviceReading(
  ctx: ActionCtx,
  accessKey: string,
  secretKey: string,
  device: { _id: Id<"devices">; deviceSn: string; dcInputSource?: DcInputSource },
  snapshot: OnlineSnapshot
): Promise<"refreshed" | "offline" | "busy"> {
  if (!snapshot.onlineSerials.has(device.deviceSn)) {
    await ctx.runMutation(internal.readings.recordCollectionStatus, {
      deviceId: device._id, status: "offline", checkedAt: snapshot.checkedAt,
    });
    return "offline";
  }

  try {
    // Temperature arrives less often than power and has an independent lease.
    // Scheduling it must neither delay the power capture nor change its health.
    await ctx.scheduler.runAfter(0, internal.ecoflowMqttDiagnostics.captureTemperature, { deviceId: device._id });
  } catch {
    console.warn("EcoFlow temperature capture could not be scheduled");
  }

  try {
    const capture = await ctx.runAction(internal.ecoflowMqttDiagnostics.captureReading, {
      deviceId: device._id,
    });
    if (capture.reason === "capture_busy") return "busy";
    const live = selectLivePdMeasurement(capture);
    const quota = await getDeviceQuota(accessKey, secretKey, device.deviceSn);
    const fetchedAt = Date.now();
    if (!quota) throw new Error("EcoFlow API returned no usable telemetry");
    const liveQuota = overlayLivePdMeasurement(quota, live);
    const reading = transformQuotaToReading(liveQuota, { dcInputSource: device.dcInputSource });
    const recordedAt = live.latest.receivedAt;
    // The full profile asserts availability of the validated PD AC/total pair.
    // Live aggregate liveness alone must not acquire that source provenance.
    const sourceComplete = Number.isFinite(live.latest.values.inputWatts) && live.latest.values.inputWatts >= 0;
    const inputMeasurement: InputMeasurement | undefined = sourceComplete && reading.inputMeasurement === "delta2-pd-v1"
      ? "delta2-pd-mqtt-v1"
      : undefined;
    const supportedPanelProfile = getQuotaValue(liveQuota, "pd.model") === 80 &&
      getQuotaValue(liveQuota, "pd.sysVer") === 16908850;
    const solarPanel = supportedPanelProfile ? selectSolarPanelTelemetry(capture, recordedAt) : null;
    if (reading.batteryLevel === undefined && reading.inputWatts === undefined && reading.outputWatts === undefined) {
      throw new Error("EcoFlow API returned no usable telemetry");
    }
    // The extracted values and quality flag suffice; full telemetry can contain
    // private identifiers and unnecessarily inflates retained history.
    await ctx.runMutation(internal.readings.insertReading, {
      deviceId: device._id, ...reading, inputMeasurement, powerMeasurement: "pd-totals-mqtt-v1", recordedAt,
      ...(solarPanel ?? {}),
    });
    const telemetry = buildDisplayTelemetry(quota, live, reading, fetchedAt);
    if (Object.keys(telemetry).length > 0) {
      try {
        await ctx.runMutation(internal.devices_internal.recordDisplayTelemetry, { deviceId: device._id, telemetry });
      } catch {
        // Supplemental display availability must not invalidate a stored live capture.
        console.warn("EcoFlow display telemetry cache could not be updated");
      }
    }
    await ctx.runMutation(internal.readings.recordCollectionStatus, {
      deviceId: device._id, status: "online", checkedAt: recordedAt,
    });
    return "refreshed";
  } catch {
    await ctx.runMutation(internal.readings.recordCollectionStatus, {
      deviceId: device._id, status: "error", checkedAt: snapshot.checkedAt,
    });
    throw new Error("EcoFlow telemetry could not be collected");
  }
}

// ─── Convex Actions ──────────────────────────────────────────────────────────

// Keep diagnostics bounded and deliberately omit serials, credentials, and raw
// payloads. These fields help compare measurement points and source counters.
const POWER_TELEMETRY_FIELDS = [
  "pd.wattsInSum", "pd.inputWatts", "pd.inWatts", "pd.wattsOutSum", "pd.outputWatts",
  "pd.soc", "pd.remainTime", "pd.chargerType", "pd.chgDsgState",
  "pd.acChargeFlag", "pd.redunChargeFlag", "pd.pvChgPrioSet",
  "pd.chgPowerAC", "pd.chgSunPower", "pd.chgPowerDC",
  "pd.dsgPowerAC", "pd.dsgPowerDC", "pd.invUsedTime", "pd.dcInUsedTime", "pd.mpptUsedTime",
  "pd.sysVer", "pd.wifiVer", "pd.model",
  "inv.inputWatts", "inv.outputWatts", "inv.acInVol", "inv.acInAmp", "inv.dcInVol",
  "inv.dcInAmp", "inv.chargerType", "inv.chargerState", "inv.sysVer", "inv.swVer",
  "mppt.inWatts", "mppt.inVol", "mppt.inAmp", "mppt.outVol", "mppt.outAmp", "mppt.outWatts",
  "mppt.chgType", "mppt.x60ChgType", "mppt.cfgChgType", "mppt.chgState", "mppt.swVer",
  "bms_bmsStatus.inputWatts", "bms_bmsStatus.outputWatts", "bms_bmsStatus.vol",
  "bms_bmsStatus.amp", "bms_bmsStatus.soc",
  "bms_emsStatus.chgState", "bms_emsStatus.chgVol", "bms_emsStatus.chgAmp",
] as const;

/** Read-only internal diagnostic: GET telemetry without collecting a reading. */
export const inspectPowerTelemetry = internalAction({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    const device = await ctx.runQuery(internal.devices_internal.getById, {
      deviceId: args.deviceId,
    });
    if (!device || !device.isActive) throw new Error("Device unavailable");

    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;
    if (!accessKey || !secretKey) throw new Error("EcoFlow API credentials not configured");

    const requestedAt = Date.now();
    const snapshot = await getOnlineSnapshot(accessKey, secretKey);
    if (!snapshot.onlineSerials.has(device.deviceSn)) {
      return { online: false, requestedAt, receivedAt: Date.now(), fields: {} };
    }

    const quota = await getDeviceQuota(accessKey, secretKey, device.deviceSn);
    if (!quota) throw new Error("EcoFlow API returned no usable telemetry");
    const fields: Record<string, number> = {};
    for (const key of POWER_TELEMETRY_FIELDS) {
      const value = getQuotaValue(quota, key);
      if (value !== null) fields[key] = value;
    }
    return { online: true, requestedAt, receivedAt: Date.now(), fields };
  },
});

/**
 * Collect readings for ALL users.
 * Called by the cron job every minute.
 * Checks each user's collectionIntervalMinutes to decide whether to actually collect.
 */
export const collectAllUserReadings = internalAction({
  args: {},
  handler: async (ctx) => {
    // Skip in dev deployment to save database bandwidth
    if (process.env.DISABLE_CRONS === "true") {
      return { success: true, skipped: true, reason: "DISABLE_CRONS is set" };
    }

    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;

    if (!accessKey || !secretKey) {
      console.error("EcoFlow API credentials not configured");
      return { success: false, error: "Missing API credentials" };
    }

    // Include device owners who have never opened/saved retention settings.
    const allSettings = await ctx.runQuery(
      internal.settings.getCollectionSettingsForDevices
    );

    const now = Date.now();
    let totalReadings = 0;
    let usersCollected = 0;
    let devicesOffline = 0;
    let devicesFailed = 0;
    let devicesBusy = 0;
    const errors: string[] = [];
    // One device-list request per run, shared by every user's active devices.
    let snapshotPromise: Promise<OnlineSnapshot> | undefined;

    for (const settings of allSettings) {
      const configuredInterval = settings.collectionIntervalMinutes ?? 5;
      const intervalMs = (Number.isFinite(configuredInterval) ? Math.max(1, configuredInterval) : 5) * 60 * 1000;
      const lastCollection = settings.lastCollectionAt ?? 0;

      // Stable slots avoid missing every other minute when cron execution
      // duration/jitter makes successive start times slightly less than 60s apart.
      if (Math.floor(now / intervalMs) <= Math.floor(lastCollection / intervalMs)) {
        continue;
      }

      try {
        // Get this user's devices
        const devices = await ctx.runQuery(
          internal.devices_internal.listByUserId,
          { userId: settings.userId }
        );

        let userReadings = 0;
        for (const device of devices) {
          if (!device.isActive) continue;

          try {
            snapshotPromise ??= getOnlineSnapshot(accessKey, secretKey);
            const result = await captureDeviceReading(ctx, accessKey, secretKey, device, await snapshotPromise);
            if (result === "refreshed") {
              totalReadings++;
              userReadings++;
            } else if (result === "busy") {
              devicesBusy++;
            } else {
              devicesOffline++;
            }
          } catch {
            devicesFailed++;
            await ctx.runMutation(internal.readings.recordCollectionStatus, {
              deviceId: device._id, status: "error", checkedAt: now,
            });
            errors.push("A device reading could not be collected");
          }
        }

        // Keep partial/failed users due so one online device cannot postpone a
        // failed sibling's next retry for the user's full collection interval.
        if (userReadings > 0) {
          usersCollected++;
          if (userReadings === devices.filter((device) => device.isActive).length) {
            await ctx.runMutation(internal.settings.updateLastCollection, {
              userId: settings.userId,
              timestamp: now,
            });
          }
        }
      } catch {
        errors.push("A user's readings could not be collected");
      }
    }

    return { success: errors.length === 0 && devicesOffline === 0, usersCollected, totalReadings, devicesOffline, devicesFailed, devicesBusy, errors };
  },
});

/**
 * Fetch devices from EcoFlow API — used for device discovery during registration.
 * Public action so the dashboard add-device page can show available devices.
 */
export const discoverDevices = action({
  args: {},
  handler: async (ctx) => {
    // Verify authenticated user
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;

    if (!accessKey || !secretKey) {
      throw new Error("EcoFlow API credentials not configured");
    }

    const devices = await getDeviceList(accessKey, secretKey);
    return devices.map((d) => ({
      sn: d.sn,
      productType: d.productType,
      productName: d.productName,
      online: d.online === 1,
    }));
  },
});

// ─── Device Control Actions ──────────────────────────────────────────────────

/**
 * Validate device ownership and return API credentials.
 * Shared by all device control actions.
 */
async function validateDeviceAccess(
  ctx: ActionCtx,
  userId: Id<"users">,
  deviceSn: string
) {
  const device = await ctx.runQuery(internal.devices_internal.getBySnForUser, {
    deviceSn,
    userId,
  });
  if (!device) throw new Error("Device not found or not owned by user");

  const accessKey = process.env.ECOFLOW_ACCESS_KEY;
  const secretKey = process.env.ECOFLOW_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("EcoFlow API credentials not configured");

  return { device, accessKey, secretKey };
}

/**
 * Generic SET command — sends any moduleType/operateType/params to the device.
 * Auth-gated, validates device ownership.
 */
export const setDeviceQuota = action({
  args: {
    deviceSn: v.string(),
    moduleType: v.float64(),
    operateType: v.string(),
    params: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);

    const result = await setDeviceQuotaRequest(accessKey, secretKey, {
      sn: args.deviceSn,
      moduleType: args.moduleType,
      operateType: args.operateType,
      params: args.params,
    });

    if (!result.success) {
      throw new Error(`EcoFlow SET failed: ${result.message} (code: ${result.code})`);
    }

    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * Toggle a port: AC output, DC/USB output, or 12V car charger.
 */
export const setPortState = action({
  args: {
    deviceSn: v.string(),
    port: v.union(v.literal("ac"), v.literal("dcUsb"), v.literal("car")),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);
    const enabledVal = args.enabled ? 1 : 0;

    let body: { sn: string; moduleType: number; operateType: string; params: Record<string, unknown> };

    switch (args.port) {
      case "ac": {
        // acOutCfg requires all 4 params — read current values for the ones not being changed
        const currentConfig = await ctx.runQuery(internal.readings.getLatestAcConfig, { deviceId: device._id });
        const outVoltage =
          typeof currentConfig?.acOutVoltage === "number" && currentConfig.acOutVoltage >= 100
            ? currentConfig.acOutVoltage
            : 220;
        const outFrequency =
          currentConfig?.acOutFrequency === 50 || currentConfig?.acOutFrequency === 60
            ? currentConfig.acOutFrequency
            : 50;
        body = {
          sn: args.deviceSn, moduleType: 5, operateType: "acOutCfg",
          params: {
            enabled: enabledVal,
            xboost: currentConfig?.acXboost ? 1 : 0,
            out_voltage: outVoltage,
            out_freq: outFrequency,
          },
        };
        break;
      }
      case "dcUsb":
        body = { sn: args.deviceSn, moduleType: 1, operateType: "dcOutCfg", params: { enabled: enabledVal } };
        break;
      case "car":
        body = { sn: args.deviceSn, moduleType: 5, operateType: "mpptCar", params: { enabled: enabledVal } };
        break;
    }

    const result = await setDeviceQuotaRequest(accessKey, secretKey, body);
    if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);

    // Optimistic: patch latest reading so UI updates instantly
    const patchFields: Record<string, boolean> = {};
    if (args.port === "ac") patchFields.acEnabled = args.enabled;
    if (args.port === "dcUsb") patchFields.dcOutEnabled = args.enabled;
    if (args.port === "car") patchFields.carChargerEnabled = args.enabled;
    await ctx.runMutation(internal.readings.patchLatestReading, {
      deviceId: device._id, fields: patchFields,
    });

    // Delayed refresh to sync full state from EcoFlow API
    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * Configure AC output: enabled, X-Boost, voltage, frequency.
 */
export const setAcConfig = action({
  args: {
    deviceSn: v.string(),
    enabled: v.optional(v.boolean()),
    xboost: v.optional(v.boolean()),
    outVoltage: v.optional(v.float64()),
    outFrequency: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);

    // acOutCfg requires all 4 params — read current values for fields not being changed
    const currentConfig = await ctx.runQuery(internal.readings.getLatestAcConfig, { deviceId: device._id });

    const params: Record<string, unknown> = {
      enabled: args.enabled !== undefined
        ? (args.enabled ? 1 : 0)
        : (currentConfig?.acEnabled ? 1 : 0),
      xboost: args.xboost !== undefined
        ? (args.xboost ? 1 : 0)
        : (currentConfig?.acXboost ? 1 : 0),
      out_voltage: args.outVoltage
        ?? (typeof currentConfig?.acOutVoltage === "number" && currentConfig.acOutVoltage >= 100
          ? currentConfig.acOutVoltage
          : 220),
      out_freq: args.outFrequency
        ?? (currentConfig?.acOutFrequency === 50 || currentConfig?.acOutFrequency === 60
          ? currentConfig.acOutFrequency
          : 50),
    };

    const result = await setDeviceQuotaRequest(accessKey, secretKey, {
      sn: args.deviceSn, moduleType: 5, operateType: "acOutCfg", params,
    });
    if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);

    // Optimistic: patch latest reading so UI updates instantly
    const patchFields: Record<string, boolean> = {};
    if (args.enabled !== undefined) patchFields.acEnabled = args.enabled;
    if (args.xboost !== undefined) patchFields.acXboost = args.xboost;
    await ctx.runMutation(internal.readings.patchLatestReading, {
      deviceId: device._id, fields: patchFields,
    });

    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * Configure AC charging rate and pause flag, or 12V DC charging current.
 */
export const setChargingConfig = action({
  args: {
    deviceSn: v.string(),
    chgWatts: v.optional(v.float64()),
    chgPauseFlag: v.optional(v.boolean()),
    dcChgCurrent: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);

    // AC charging config — acChgCfg requires both chgWatts and chgPauseFlag
    if (args.chgWatts !== undefined || args.chgPauseFlag !== undefined) {
      const currentConfig = await ctx.runQuery(internal.readings.getLatestAcConfig, { deviceId: device._id });
      const params = {
        chgWatts: args.chgWatts ?? currentConfig?.acChargingWatts ?? 600,
        chgPauseFlag: args.chgPauseFlag !== undefined ? (args.chgPauseFlag ? 1 : 0) : (currentConfig?.acChargingPaused ? 1 : 0),
      };

      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 5, operateType: "acChgCfg", params,
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    // 12V DC charging current
    if (args.dcChgCurrent !== undefined) {
      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 5, operateType: "dcChgCfg", params: { dcChgCfg: args.dcChgCurrent },
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    // Optimistic UI patch
    const patchFields: Record<string, number | boolean> = {};
    if (args.chgWatts !== undefined) patchFields.acChargingWatts = args.chgWatts;
    if (args.chgPauseFlag !== undefined) patchFields.acChargingPaused = args.chgPauseFlag;
    if (args.dcChgCurrent !== undefined) patchFields.dcChargingCurrent = args.dcChgCurrent;
    if (Object.keys(patchFields).length > 0) {
      await ctx.runMutation(internal.readings.patchLatestReading, {
        deviceId: device._id, fields: patchFields,
      });
    }

    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * Set standby timers: AC standby, CAR standby, unit standby.
 */
export const setStandbyTimers = action({
  args: {
    deviceSn: v.string(),
    acStandbyMins: v.optional(v.float64()),
    carStandbyMins: v.optional(v.float64()),
    unitStandbyMins: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);

    if (args.acStandbyMins !== undefined) {
      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 5, operateType: "standbyTime", params: { standbyMins: args.acStandbyMins },
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    if (args.carStandbyMins !== undefined) {
      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 5, operateType: "carStandby", params: { standbyMins: args.carStandbyMins },
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    if (args.unitStandbyMins !== undefined) {
      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 1, operateType: "standbyTime", params: { standbyMin: args.unitStandbyMins },
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * Set LCD screen timeout. Brightness is hardcoded to 3 per EcoFlow docs.
 */
export const setLcdConfig = action({
  args: {
    deviceSn: v.string(),
    delayOff: v.float64(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);

    const result = await setDeviceQuotaRequest(accessKey, secretKey, {
      sn: args.deviceSn, moduleType: 1, operateType: "lcdCfg",
      params: { delayOff: args.delayOff, brighLevel: 3 },
    });
    if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);

    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * Energy management: enable/disable, backup reserve SoC, solar priority, AC always on.
 */
export const setEnergyManagement = action({
  args: {
    deviceSn: v.string(),
    isConfig: v.optional(v.boolean()),
    bpPowerSoc: v.optional(v.float64()),
    solarPriority: v.optional(v.boolean()),
    acAutoOutConfig: v.optional(v.boolean()),
    minAcOutSoc: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);

    // Fetch energy config once for both watthConfig and acAutoOutConfig blocks
    const needsEnergyConfig = args.isConfig !== undefined || args.bpPowerSoc !== undefined ||
      args.acAutoOutConfig !== undefined || args.minAcOutSoc !== undefined;
    const currentConfig = needsEnergyConfig
      ? await ctx.runQuery(internal.readings.getLatestEnergyConfig, { deviceId: device._id })
      : null;

    // Energy management config — watthConfig requires all 4 params
    if (args.isConfig !== undefined || args.bpPowerSoc !== undefined) {
      const params = {
        isConfig: args.isConfig !== undefined ? (args.isConfig ? 1 : 0) : (currentConfig?.energyMgmtEnabled ? 1 : 0),
        bpPowerSoc: args.bpPowerSoc ?? currentConfig?.backupReserveSoc ?? 50,
        minDsgSoc: currentConfig?.minDischargeSoc ?? 255,
        minChgSoc: currentConfig?.maxChargeSoc ?? 255,
      };

      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 1, operateType: "watthConfig", params,
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    // Solar charging priority
    if (args.solarPriority !== undefined) {
      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 1, operateType: "pvChangePrio",
        params: { pvChangeSet: args.solarPriority ? 1 : 0 },
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    // AC always on — acAutoOutConfig requires both params
    if (args.acAutoOutConfig !== undefined || args.minAcOutSoc !== undefined) {
      const params = {
        acAutoOutConfig: args.acAutoOutConfig !== undefined ? (args.acAutoOutConfig ? 1 : 0) : (currentConfig?.acAutoOutEnabled ? 1 : 0),
        minAcOutSoc: args.minAcOutSoc ?? currentConfig?.minAcOutSoc ?? 20,
      };

      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 1, operateType: "acAutoOutConfig", params,
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * BMS config: max charge SoC and min discharge SoC.
 */
export const setBmsConfig = action({
  args: {
    deviceSn: v.string(),
    maxChargeSoc: v.optional(v.float64()),
    minDischargeSoc: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);

    if (args.maxChargeSoc !== undefined) {
      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 2, operateType: "upsConfig",
        params: { maxChgSoc: args.maxChargeSoc },
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    if (args.minDischargeSoc !== undefined) {
      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 2, operateType: "dsgCfg",
        params: { minDsgSoc: args.minDischargeSoc },
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * Smart Generator: ON/OFF SoC thresholds.
 */
export const setSmartGenerator = action({
  args: {
    deviceSn: v.string(),
    openOilSoc: v.optional(v.float64()),
    closeOilSoc: v.optional(v.float64()),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);

    if (args.openOilSoc !== undefined) {
      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 2, operateType: "openOilSoc",
        params: { openOilSoc: args.openOilSoc },
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    if (args.closeOilSoc !== undefined) {
      const result = await setDeviceQuotaRequest(accessKey, secretKey, {
        sn: args.deviceSn, moduleType: 2, operateType: "closeOilSoc",
        params: { closeOilSoc: args.closeOilSoc },
      });
      if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);
    }

    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * Toggle buzzer silent mode.
 */
export const setBuzzer = action({
  args: {
    deviceSn: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const { device, accessKey, secretKey } = await validateDeviceAccess(ctx, userId, args.deviceSn);

    // quietMode: enabled=1 means silent mode ON (no beep), enabled=0 means silent mode OFF (buzzer beeps)
    // args.enabled=true means "buzzer should beep" → send enabled=0 (disable silent mode)
    // args.enabled=false means "buzzer should be silent" → send enabled=1 (enable silent mode)
    const result = await setDeviceQuotaRequest(accessKey, secretKey, {
      sn: args.deviceSn, moduleType: 5, operateType: "quietMode",
      params: { enabled: args.enabled ? 0 : 1 },
    });
    if (!result.success) throw new Error(`EcoFlow SET failed: ${result.message}`);

    // Optimistic: buzzerSilent in DB = true means buzzer beeps (enabled)
    await ctx.runMutation(internal.readings.patchLatestReading, {
      deviceId: device._id, fields: { buzzerSilent: args.enabled },
    });

    await ctx.scheduler.runAfter(5000, internal.ecoflow.refreshDeviceReading, {
      deviceSn: args.deviceSn, deviceId: device._id,
    });
    return { success: true };
  },
});

/**
 * Internal SET command — no auth check, used by the schedule processor cron.
 */
export const setDeviceQuotaInternal = internalAction({
  args: {
    deviceSn: v.string(),
    moduleType: v.float64(),
    operateType: v.string(),
    params: v.any(),
  },
  handler: async (ctx, args) => {
    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;
    if (!accessKey || !secretKey) throw new Error("EcoFlow API credentials not configured");

    const result = await setDeviceQuotaRequest(accessKey, secretKey, {
      sn: args.deviceSn,
      moduleType: args.moduleType,
      operateType: args.operateType,
      params: args.params,
    });

    if (!result.success) {
      throw new Error(`EcoFlow SET failed: ${result.message} (code: ${result.code})`);
    }

    return { success: true };
  },
});

/**
 * Refresh a single device's reading by fetching latest quota from EcoFlow API.
 * Scheduled after successful SET commands; subject to the same liveness checks.
 */
export const refreshDeviceReading = internalAction({
  args: {
    deviceSn: v.string(),
    deviceId: v.id("devices"),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;
    if (!accessKey || !secretKey) return { success: false };

    try {
      const device = await ctx.runQuery(internal.devices_internal.getById, {
        deviceId: args.deviceId,
      });
      if (!device || !device.isActive || device.deviceSn !== args.deviceSn) return { success: false };
      const snapshot = await getOnlineSnapshot(accessKey, secretKey);
      const result = await captureDeviceReading(ctx, accessKey, secretKey, device, snapshot);
      return { success: result === "refreshed" || result === "busy", status: result };
    } catch {
      await ctx.runMutation(internal.readings.recordCollectionStatus, {
        deviceId: args.deviceId, status: "error", checkedAt: startedAt,
      });
      return { success: false, status: "failed" as const };
    }
  },
});

// ─── On-Demand Refresh ───────────────────────────────────────────────────────

/**
 * Public action: fetch fresh readings from EcoFlow API on demand.
 * Called by the frontend when the user returns to the tab, navigates pages,
 * or clicks refresh. Explicit manual requests bypass snapshot freshness, but
 * all on-demand attempts share an atomic per-device two-minute request limit.
 */
export const refreshReadings = action({
  args: {
    deviceId: v.optional(v.id("devices")),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;
    if (!accessKey || !secretKey) {
      throw new Error("EcoFlow API credentials not configured");
    }

    let devicesRefreshed = 0;
    let devicesSkipped = 0;
    let devicesFresh = 0;
    let devicesRateLimited = 0;
    let devicesOffline = 0;
    let devicesFailed = 0;
    let devicesBusy = 0;
    let retryAfterMs = 0;
    let snapshotPromise: Promise<OnlineSnapshot> | undefined;

    // Determine which devices to refresh
    let devices: Array<Doc<"devices">>;

    if (args.deviceId) {
      // Single device — validate ownership
      const device = await ctx.runQuery(internal.devices_internal.getById, {
        deviceId: args.deviceId,
      });
      if (!device || device.userId !== userId) {
        throw new Error("Device not found or not owned by user");
      }
      devices = [device];
    } else {
      // All user devices
      const allDevices = await ctx.runQuery(
        internal.devices_internal.listByUserId,
        { userId }
      );
      devices = allDevices;
    }

    for (const device of devices) {
      if (!device.isActive) {
        devicesSkipped++;
        continue;
      }

      try {
        const claim = await ctx.runMutation(internal.readings.claimRefreshAttempt, {
          deviceId: device._id, force: args.force,
        });
        if (!claim.allowed) {
          devicesSkipped++;
          if (claim.reason === "fresh") devicesFresh++;
          else devicesRateLimited++;
          retryAfterMs = Math.max(retryAfterMs, claim.retryAfterMs);
          continue;
        }

        snapshotPromise ??= getOnlineSnapshot(accessKey, secretKey);
        const result = await captureDeviceReading(ctx, accessKey, secretKey, device, await snapshotPromise);
        if (result === "refreshed") {
          devicesRefreshed++;
        } else if (result === "busy") {
          devicesSkipped++;
          devicesBusy++;
        } else {
          devicesOffline++;
        }
      } catch {
        devicesFailed++;
        await ctx.runMutation(internal.readings.recordCollectionStatus, {
          deviceId: device._id, status: "error", checkedAt: startedAt,
        });
      }
    }

    return {
      success: devicesFailed === 0 && devicesOffline === 0,
      devicesRefreshed, devicesSkipped, devicesFresh, devicesRateLimited,
      devicesOffline, devicesFailed, devicesBusy, retryAfterMs,
    };
  },
});
