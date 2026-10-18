import type { DiagnosticFrame, MqttDiagnosticResult } from "./ecoflowMqttDiagnostics";

const MAX_PD_RECEIPT_DISTANCE_MS = 5_000;
const MAX_REPORT_AGE_MS = 10_000;

export interface SolarPanelTelemetry {
  solarPanelInputWatts: number;
  solarPanelReceivedAt: number;
  solarPanelMeasurement: "delta2-mppt-mqtt-v1";
}

type Capture = Pick<MqttDiagnosticResult, "startedAt" | "finishedAt" | "frames">;

function finiteNonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function explicitSolarPower(frame: DiagnosticFrame): number | null {
  const values = frame.values;
  if (!values || Array.isArray(values) || typeof values !== "object") return null;
  if (
    !Object.prototype.hasOwnProperty.call(values, "inWatts") ||
    !Object.prototype.hasOwnProperty.call(values, "chgType") ||
    values.chgType !== 2 || !finiteNonnegative(values.inWatts)
  ) return null;
  return values.inWatts;
}

/**
 * MPPT PV input is a separate measurement from the station's PD input split.
 * Never subtract it from PD totals, infer missing AC, or merge fields across
 * packets. Each accepted packet explicitly reports both PV watts and solar type.
 * The caller validates the supported DELTA 2 device identity independently.
 */
export function selectSolarPanelTelemetry(
  capture: Capture,
  latestPdReceivedAt: number,
): SolarPanelTelemetry | null {
  const { startedAt, finishedAt, frames } = capture;
  if (
    !finiteNonnegative(startedAt) || !finiteNonnegative(finishedAt) ||
    finishedAt < startedAt || !finiteNonnegative(latestPdReceivedAt) ||
    latestPdReceivedAt < startedAt || latestPdReceivedAt > finishedAt ||
    finishedAt - latestPdReceivedAt > MAX_REPORT_AGE_MS
  ) return null;

  let previousClock: number | null = null;
  let previousReceipt: number | null = null;
  let previousSolar: DiagnosticFrame | null = null;
  let latestSolar: DiagnosticFrame | null = null;
  let latestPower: number | null = null;

  for (const frame of frames) {
    if (frame.module !== "mppt" || frame.retained || frame.duplicate) continue;
    if (
      !finiteNonnegative(frame.moduleTime) || !finiteNonnegative(frame.receivedAt) ||
      frame.receivedAt < startedAt || frame.receivedAt > finishedAt ||
      (previousClock !== null && frame.moduleTime <= previousClock) ||
      (previousReceipt !== null && frame.receivedAt < previousReceipt)
    ) {
      // A reset/replay cannot establish uninterrupted progress in this session.
      return null;
    }
    previousClock = frame.moduleTime;
    previousReceipt = frame.receivedAt;

    const power = explicitSolarPower(frame);
    if (power === null) {
      // Later adapter/unknown/partial reports invalidate the previous solar pair.
      previousSolar = null;
      latestSolar = null;
      latestPower = null;
      continue;
    }
    previousSolar = latestSolar;
    latestSolar = frame;
    latestPower = power;
  }

  if (!previousSolar || !latestSolar || latestPower === null) return null;
  for (const frame of [previousSolar, latestSolar]) {
    if (
      finishedAt - frame.receivedAt > MAX_REPORT_AGE_MS ||
      Math.abs(frame.receivedAt - latestPdReceivedAt) > MAX_PD_RECEIPT_DISTANCE_MS
    ) return null;
  }
  return {
    solarPanelInputWatts: latestPower,
    solarPanelReceivedAt: latestSolar.receivedAt,
    solarPanelMeasurement: "delta2-mppt-mqtt-v1",
  };
}
