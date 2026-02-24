"use node";

import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
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
  const allParams: Record<string, string | number> = {
    ...params,
    accessKey,
    nonce,
    timestamp,
  };

  const sortedParams = Object.keys(allParams)
    .sort()
    .map((key) => `${key}=${allParams[key]}`)
    .join("&");

  return crypto
    .createHmac("sha256", secretKey)
    .update(sortedParams)
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
