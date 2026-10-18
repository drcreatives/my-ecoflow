import type { Doc } from "./_generated/dataModel";

// Portable scalar data only. Raw vendor payloads and database/auth metadata do
// not belong in browser downloads or email attachments.
const fields = [
  "batteryLevel", "inputWatts", "acInputWatts", "dcInputWatts", "solarInputWatts",
  "chargingType", "chargingTypeSource", "inputQuality", "inputMeasurement",
  "powerMeasurement", "solarPanelInputWatts", "solarPanelReceivedAt", "solarPanelMeasurement",
  "outputWatts", "acOutputWatts", "dcOutputWatts", "usbOutputWatts",
  "remainingTime", "temperature", "status", "acEnabled", "dcOutEnabled",
  "carChargerEnabled", "acXboost", "acOutVoltage", "acOutFrequency",
  "acChargingWatts", "acChargingPaused", "dcChargingCurrent", "acStandbyMins",
  "carStandbyMins", "unitStandbyMins", "maxChargeSoc", "minDischargeSoc",
  "solarPriority", "energyMgmtEnabled", "backupReserveSoc", "acAutoOutEnabled",
  "minAcOutSoc", "smartGenOnSoc", "smartGenOffSoc", "lcdOffSeconds", "buzzerSilent",
  "readingKind", "temperatureMeasurement",
] as const satisfies readonly (keyof Doc<"deviceReadings">)[];

export type ReadingExport = {
  [Key in typeof fields[number]]: Exclude<Doc<"deviceReadings">[Key], undefined> | null;
} & { recordedAt: number; deviceSn: string; deviceName: string };

export function serializeReadingForExport(
  reading: Doc<"deviceReadings">,
  device: Pick<Doc<"devices">, "deviceSn" | "deviceName">
): ReadingExport {
  const scalarFields = Object.fromEntries(fields.map(field => [field, reading[field] ?? null]));
  return {
    ...scalarFields,
    recordedAt: reading.recordedAt,
    deviceSn: device.deviceSn,
    deviceName: device.deviceName ?? "EcoFlow Device",
  } as ReadingExport;
}
