"use node";

import { internalAction, action } from "./_generated/server";
import { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import crypto from "crypto";
import { auth } from "./auth";

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

function generateSignature(
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

  const response = await fetch(url, {
    method,
    headers,
  });

  if (!response.ok) {
    throw new Error(`EcoFlow API HTTP ${response.status}: ${response.statusText}`);
  }

  const data: APIResponse<T> = await response.json();
  if (data.code !== "0") {
    throw new Error(`EcoFlow API error: ${data.message} (code: ${data.code})`);
  }

  return data;
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
  return response.data || [];
}

// ─── SET Command Helpers ─────────────────────────────────────────────────────

/**
 * Flatten a nested object into dot-separated key-value pairs for signature generation.
 * E.g. { sn: "X", params: { enabled: 1 } } → { "sn": "X", "params.enabled": "1" }
 */
function flattenParams(
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

  console.log("[EcoFlow SET] URL:", `${baseURL}/iot-open/sign/device/quota`);
  console.log("[EcoFlow SET] Full body:", JSON.stringify(fullBody, null, 2));
  console.log("[EcoFlow SET] Flattened params for signature:", JSON.stringify(flatBody, null, 2));
  console.log("[EcoFlow SET] Headers:", JSON.stringify({ accessKey: accessKey.slice(0, 8) + "...", nonce, timestamp: timestamp.toString(), sign: signature }));

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
  console.log("[EcoFlow SET] Response status:", response.status, response.statusText);
  console.log("[EcoFlow SET] Response body:", responseText);

  if (!response.ok) {
    throw new Error(`EcoFlow SET API HTTP ${response.status}: ${response.statusText} — ${responseText}`);
  }

  const data: APIResponse = JSON.parse(responseText);
  console.log("[EcoFlow SET] Parsed response — code:", data.code, "message:", data.message);
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

  const url = `${baseURL}/iot-open/sign/device/quota/all?sn=${deviceSN}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      accessKey,
      nonce,
      timestamp: timestamp.toString(),
      sign: signature,
    },
  });

  if (!response.ok) {
    throw new Error(`EcoFlow Quota API HTTP ${response.status}`);
  }

  const data: APIResponse<Record<string, number | string>> = await response.json();
  if (data.code !== "0") {
    throw new Error(`EcoFlow Quota API error: ${data.message}`);
  }

  return data.data || null;
}

function getQuotaValue(
  data: Record<string, number | string>,
  key: string
): number | null {
  const value = data[key];
  if (value === undefined || value === null) return null;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? null : num;
}

function transformQuotaToReading(data: Record<string, number | string>) {
  // === INPUT POWER ===
  const acInputWatts = getQuotaValue(data, "inv.inputWatts") || 0;
  const dcInputWatts = getQuotaValue(data, "mppt.inWatts") || 0;
  const totalInput =
    getQuotaValue(data, "pd.wattsInSum") || acInputWatts + dcInputWatts;
  const chgType = getQuotaValue(data, "mppt.chgType");

  // === OUTPUT POWER ===
  const acOutputWatts = getQuotaValue(data, "inv.outputWatts") || 0;
  const carWatts = getQuotaValue(data, "pd.carWatts") || 0;
  const dcOutputWatts = carWatts;

  const usb1 = getQuotaValue(data, "pd.usb1Watts") || 0;
  const usb2 = getQuotaValue(data, "pd.usb2Watts") || 0;
  const typec1 = getQuotaValue(data, "pd.typec1Watts") || 0;
  const typec2 = getQuotaValue(data, "pd.typec2Watts") || 0;
  const qcUsb1 = getQuotaValue(data, "pd.qcUsb1Watts") || 0;
  const qcUsb2 = getQuotaValue(data, "pd.qcUsb2Watts") || 0;
  const usbOutputWatts = usb1 + usb2 + typec1 + typec2 + qcUsb1 + qcUsb2;

  const totalOutput =
    getQuotaValue(data, "pd.wattsOutSum") ||
    getQuotaValue(data, "pd.outputWatts") ||
    acOutputWatts + dcOutputWatts + usbOutputWatts;

  // === BATTERY & STATUS ===
  const batteryLevel = getQuotaValue(data, "bms_bmsStatus.soc");
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
  const netPower = totalInput - totalOutput;
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
    inputWatts: totalInput,
    acInputWatts,
    dcInputWatts,
    chargingType: chgType ?? undefined,
    outputWatts: totalOutput,
    acOutputWatts,
    dcOutputWatts,
    usbOutputWatts,
    remainingTime: remainingTime ?? undefined,
    temperature: temperature ?? undefined,
    status,
    rawData: data,
    recordedAt: Date.now(),
    // === CONFIG STATE ===
    acEnabled: getQuotaValue(data, "mppt.cfgAcEnabled") === 1 ? true : getQuotaValue(data, "mppt.cfgAcEnabled") === 0 ? false : undefined,
    dcOutEnabled: getQuotaValue(data, "pd.dcOutState") === 1 ? true : getQuotaValue(data, "pd.dcOutState") === 0 ? false : undefined,
    carChargerEnabled: getQuotaValue(data, "mppt.carState") === 1 ? true : getQuotaValue(data, "mppt.carState") === 0 ? false : undefined,
    acXboost: getQuotaValue(data, "mppt.cfgAcXboost") === 1 ? true : getQuotaValue(data, "mppt.cfgAcXboost") === 0 ? false : undefined,
    acOutVoltage: getQuotaValue(data, "mppt.cfgAcOutVol") ?? undefined,
    acOutFrequency: getQuotaValue(data, "mppt.cfgAcOutFreq") ?? undefined,
    acChargingWatts: getQuotaValue(data, "mppt.cfgChgWatts") ?? undefined,
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

// ─── Convex Actions ──────────────────────────────────────────────────────────

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

    // Get all data retention settings (one per user) to check intervals
    const allSettings = await ctx.runQuery(
      internal.settings.getAllDataRetentionSettings
    );

    const now = Date.now();
    let totalReadings = 0;
    let usersCollected = 0;
    const errors: string[] = [];

    for (const settings of allSettings) {
      const intervalMs = (settings.collectionIntervalMinutes ?? 5) * 60 * 1000;
      const lastCollection = settings.lastCollectionAt ?? 0;

      // Skip if not enough time has passed since last collection
      if (now - lastCollection < intervalMs) {
        continue;
      }

      try {
        // Get this user's devices
        const devices = await ctx.runQuery(
          internal.devices_internal.listByUserId,
          { userId: settings.userId }
        );

        for (const device of devices) {
          if (!device.isActive) continue;

          try {
            // Fetch quota from EcoFlow API
            const quotaData = await getDeviceQuota(
              accessKey,
              secretKey,
              device.deviceSn
            );

            if (quotaData) {
              const reading = transformQuotaToReading(quotaData);

              // Insert the reading via mutation
              await ctx.runMutation(internal.readings.insertReading, {
                deviceId: device._id,
                batteryLevel: reading.batteryLevel,
                inputWatts: reading.inputWatts,
                acInputWatts: reading.acInputWatts,
                dcInputWatts: reading.dcInputWatts,
                chargingType: reading.chargingType,
                outputWatts: reading.outputWatts,
                acOutputWatts: reading.acOutputWatts,
                dcOutputWatts: reading.dcOutputWatts,
                usbOutputWatts: reading.usbOutputWatts,
                remainingTime: reading.remainingTime,
                temperature: reading.temperature,
                status: reading.status,
                rawData: reading.rawData,
                recordedAt: reading.recordedAt,
                // Config state
                acEnabled: reading.acEnabled,
                dcOutEnabled: reading.dcOutEnabled,
                carChargerEnabled: reading.carChargerEnabled,
                acXboost: reading.acXboost,
                acOutVoltage: reading.acOutVoltage,
                acOutFrequency: reading.acOutFrequency,
                acChargingWatts: reading.acChargingWatts,
                dcChargingCurrent: reading.dcChargingCurrent,
                acStandbyMins: reading.acStandbyMins,
                carStandbyMins: reading.carStandbyMins,
                unitStandbyMins: reading.unitStandbyMins,
                maxChargeSoc: reading.maxChargeSoc,
                minDischargeSoc: reading.minDischargeSoc,
                solarPriority: reading.solarPriority,
                energyMgmtEnabled: reading.energyMgmtEnabled,
                backupReserveSoc: reading.backupReserveSoc,
                acAutoOutEnabled: reading.acAutoOutEnabled,
                minAcOutSoc: reading.minAcOutSoc,
                smartGenOnSoc: reading.smartGenOnSoc,
                smartGenOffSoc: reading.smartGenOffSoc,
                lcdOffSeconds: reading.lcdOffSeconds,
                buzzerSilent: reading.buzzerSilent,
              });

              totalReadings++;
            }
          } catch (deviceError) {
            const msg = `Device ${device.deviceSn}: ${deviceError instanceof Error ? deviceError.message : "Unknown error"}`;
            console.error(msg);
            errors.push(msg);
          }
        }

        // Update last collection time for this user
        await ctx.runMutation(internal.settings.updateLastCollection, {
          userId: settings.userId,
          timestamp: now,
        });

        usersCollected++;
      } catch (userError) {
        const msg = `User ${settings.userId}: ${userError instanceof Error ? userError.message : "Unknown error"}`;
        console.error(msg);
        errors.push(msg);
      }
    }

    console.log(
      `Cron collection complete: ${usersCollected} users, ${totalReadings} readings, ${errors.length} errors`
    );

    return { success: true, usersCollected, totalReadings, errors };
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
        body = {
          sn: args.deviceSn, moduleType: 5, operateType: "acOutCfg",
          params: {
            enabled: enabledVal,
            xboost: currentConfig?.acXboost ? 1 : 0,
            out_voltage: currentConfig?.acOutVoltage ?? 30,
            out_freq: currentConfig?.acOutFrequency ?? 1,
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

    console.log(`[setPortState] port=${args.port} enabled=${args.enabled} body=`, JSON.stringify(body));
    const result = await setDeviceQuotaRequest(accessKey, secretKey, body);
    console.log(`[setPortState] result=`, JSON.stringify(result));
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
      out_voltage: args.outVoltage ?? currentConfig?.acOutVoltage ?? 30,
      out_freq: args.outFrequency ?? currentConfig?.acOutFrequency ?? 1,
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

    // AC charging config
    if (args.chgWatts !== undefined || args.chgPauseFlag !== undefined) {
      const params: Record<string, unknown> = {};
      if (args.chgWatts !== undefined) params.chgWatts = args.chgWatts;
      if (args.chgPauseFlag !== undefined) params.chgPauseFlag = args.chgPauseFlag ? 1 : 0;

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

    // Energy management config (watthConfig)
    if (args.isConfig !== undefined || args.bpPowerSoc !== undefined) {
      const params: Record<string, unknown> = {};
      if (args.isConfig !== undefined) params.isConfig = args.isConfig ? 1 : 0;
      if (args.bpPowerSoc !== undefined) params.bpPowerSoc = args.bpPowerSoc;

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

    // AC always on
    if (args.acAutoOutConfig !== undefined) {
      const params: Record<string, unknown> = { acAutoOutConfig: args.acAutoOutConfig ? 1 : 0 };
      if (args.minAcOutSoc !== undefined) params.minAcOutSoc = args.minAcOutSoc;

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
 * Scheduled after SET commands so the UI reflects changes within ~1 second.
 */
export const refreshDeviceReading = internalAction({
  args: {
    deviceSn: v.string(),
    deviceId: v.id("devices"),
  },
  handler: async (ctx, args) => {
    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;
    if (!accessKey || !secretKey) return;

    try {
      console.log("[refreshDeviceReading] Fetching quota for", args.deviceSn);
      const quotaData = await getDeviceQuota(accessKey, secretKey, args.deviceSn);
      if (!quotaData) {
        console.warn("[refreshDeviceReading] No quota data returned");
        return;
      }
      console.log("[refreshDeviceReading] Got quota, acEnabled:", quotaData["mppt.outState"], "dcEnabled:", quotaData["pd.dcOutState"], "carEnabled:", quotaData["mppt.carState"]);

      const reading = transformQuotaToReading(quotaData);
      console.log("[refreshDeviceReading] Transformed reading — acEnabled:", reading.acEnabled, "dcOutEnabled:", reading.dcOutEnabled, "buzzerSilent:", reading.buzzerSilent);
      await ctx.runMutation(internal.readings.insertReading, {
        deviceId: args.deviceId,
        batteryLevel: reading.batteryLevel,
        inputWatts: reading.inputWatts,
        acInputWatts: reading.acInputWatts,
        dcInputWatts: reading.dcInputWatts,
        chargingType: reading.chargingType,
        outputWatts: reading.outputWatts,
        acOutputWatts: reading.acOutputWatts,
        dcOutputWatts: reading.dcOutputWatts,
        usbOutputWatts: reading.usbOutputWatts,
        remainingTime: reading.remainingTime,
        temperature: reading.temperature,
        status: reading.status,
        rawData: reading.rawData,
        recordedAt: reading.recordedAt,
        acEnabled: reading.acEnabled,
        dcOutEnabled: reading.dcOutEnabled,
        carChargerEnabled: reading.carChargerEnabled,
        acXboost: reading.acXboost,
        acOutVoltage: reading.acOutVoltage,
        acOutFrequency: reading.acOutFrequency,
        acChargingWatts: reading.acChargingWatts,
        dcChargingCurrent: reading.dcChargingCurrent,
        acStandbyMins: reading.acStandbyMins,
        carStandbyMins: reading.carStandbyMins,
        unitStandbyMins: reading.unitStandbyMins,
        maxChargeSoc: reading.maxChargeSoc,
        minDischargeSoc: reading.minDischargeSoc,
        solarPriority: reading.solarPriority,
        energyMgmtEnabled: reading.energyMgmtEnabled,
        backupReserveSoc: reading.backupReserveSoc,
        acAutoOutEnabled: reading.acAutoOutEnabled,
        minAcOutSoc: reading.minAcOutSoc,
        smartGenOnSoc: reading.smartGenOnSoc,
        smartGenOffSoc: reading.smartGenOffSoc,
        lcdOffSeconds: reading.lcdOffSeconds,
        buzzerSilent: reading.buzzerSilent,
      });
    } catch (e) {
      console.warn("Failed to refresh reading after SET:", e);
    }
  },
});

// ─── On-Demand Refresh ───────────────────────────────────────────────────────

const STALENESS_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Public action: fetch fresh readings from EcoFlow API on demand.
 * Called by the frontend when the user returns to the tab, navigates pages,
 * or clicks the manual refresh button. Skips devices whose latest reading
 * is less than 2 minutes old to avoid excessive API calls.
 */
export const refreshReadings = action({
  args: {
    deviceId: v.optional(v.id("devices")),
  },
  handler: async (ctx, args) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const accessKey = process.env.ECOFLOW_ACCESS_KEY;
    const secretKey = process.env.ECOFLOW_SECRET_KEY;
    if (!accessKey || !secretKey) {
      throw new Error("EcoFlow API credentials not configured");
    }

    const now = Date.now();
    let devicesRefreshed = 0;
    let devicesSkipped = 0;

    // Determine which devices to refresh
    let devices: Array<{ _id: typeof args.deviceId extends undefined ? never : NonNullable<typeof args.deviceId>; deviceSn: string; isActive: boolean; userId: typeof userId }>;

    if (args.deviceId) {
      // Single device — validate ownership
      const device = await ctx.runQuery(internal.devices_internal.getById, {
        deviceId: args.deviceId,
      });
      if (!device || device.userId !== userId) {
        throw new Error("Device not found or not owned by user");
      }
      devices = [device] as typeof devices;
    } else {
      // All user devices
      const allDevices = await ctx.runQuery(
        internal.devices_internal.listByUserId,
        { userId }
      );
      devices = allDevices as typeof devices;
    }

    for (const device of devices) {
      if (!device.isActive) {
        devicesSkipped++;
        continue;
      }

      try {
        // Check staleness — skip if latest reading is recent enough
        const latestTimestamp = await ctx.runQuery(
          internal.readings.getLatestTimestamp,
          { deviceId: device._id }
        );
        if (latestTimestamp && now - latestTimestamp < STALENESS_THRESHOLD_MS) {
          devicesSkipped++;
          continue;
        }

        // Fetch fresh data from EcoFlow API
        const quotaData = await getDeviceQuota(
          accessKey,
          secretKey,
          device.deviceSn
        );

        if (quotaData) {
          const reading = transformQuotaToReading(quotaData);
          await ctx.runMutation(internal.readings.insertReading, {
            deviceId: device._id,
            batteryLevel: reading.batteryLevel,
            inputWatts: reading.inputWatts,
            acInputWatts: reading.acInputWatts,
            dcInputWatts: reading.dcInputWatts,
            chargingType: reading.chargingType,
            outputWatts: reading.outputWatts,
            acOutputWatts: reading.acOutputWatts,
            dcOutputWatts: reading.dcOutputWatts,
            usbOutputWatts: reading.usbOutputWatts,
            remainingTime: reading.remainingTime,
            temperature: reading.temperature,
            status: reading.status,
            rawData: reading.rawData,
            recordedAt: reading.recordedAt,
            acEnabled: reading.acEnabled,
            dcOutEnabled: reading.dcOutEnabled,
            carChargerEnabled: reading.carChargerEnabled,
            acXboost: reading.acXboost,
            acOutVoltage: reading.acOutVoltage,
            acOutFrequency: reading.acOutFrequency,
            acChargingWatts: reading.acChargingWatts,
            dcChargingCurrent: reading.dcChargingCurrent,
            acStandbyMins: reading.acStandbyMins,
            carStandbyMins: reading.carStandbyMins,
            unitStandbyMins: reading.unitStandbyMins,
            maxChargeSoc: reading.maxChargeSoc,
            minDischargeSoc: reading.minDischargeSoc,
            solarPriority: reading.solarPriority,
            energyMgmtEnabled: reading.energyMgmtEnabled,
            backupReserveSoc: reading.backupReserveSoc,
            acAutoOutEnabled: reading.acAutoOutEnabled,
            minAcOutSoc: reading.minAcOutSoc,
            smartGenOnSoc: reading.smartGenOnSoc,
            smartGenOffSoc: reading.smartGenOffSoc,
            lcdOffSeconds: reading.lcdOffSeconds,
            buzzerSilent: reading.buzzerSilent,
          });
          devicesRefreshed++;
        } else {
          devicesSkipped++;
        }
      } catch (e) {
        console.warn(
          `[refreshReadings] Failed for device ${device.deviceSn}:`,
          e
        );
        devicesSkipped++;
      }
    }

    console.log(
      `[refreshReadings] Done: ${devicesRefreshed} refreshed, ${devicesSkipped} skipped`
    );

    return { success: true, devicesRefreshed, devicesSkipped };
  },
});
