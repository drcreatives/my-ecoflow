import type { DeviceReading } from "@/lib/data-utils";

/** Preserve absent source evidence as an empty cell, including legacy readings. */
export function createHistoryCsv(readings: readonly DeviceReading[]): string {
  const headers = [
    "Timestamp", "Battery %", "Input W", "AC Input W", "DC Input W",
    "Charging Type", "Charging Type Source", "Input Quality", "Input Measurement", "Solar Input W",
    "Power Measurement", "Solar Panel Input W", "Solar Panel Received At (ms)", "Solar Panel Measurement",
    "Output W", "AC Out", "DC Out", "USB Out", "Temp °C", "Status",
    "Reading Kind", "Temperature Measurement", "Temperature Sample Count",
  ];
  const rows = readings.map(reading => [
    new Date(reading.recordedAt).toISOString(),
    reading.batteryLevel,
    reading.inputWatts,
    reading.acInputWatts,
    reading.dcInputWatts,
    reading.chargingType,
    reading.chargingTypeSource,
    reading.inputQuality,
    reading.inputMeasurement,
    reading.solarInputWatts,
    reading.powerMeasurement,
    reading.solarPanelInputWatts,
    reading.solarPanelReceivedAt,
    reading.solarPanelMeasurement,
    reading.outputWatts,
    reading.acOutputWatts,
    reading.dcOutputWatts,
    reading.usbOutputWatts,
    reading.temperature,
    reading.status,
    reading.readingKind,
    reading.temperatureMeasurement,
    reading.temperatureSampleCount,
  ].map(value => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(","));
  return [headers.join(","), ...rows].join("\n");
}

interface SettingsExportReading extends DeviceReading {
  deviceSn?: string | null;
  deviceName?: string | null;
}

/** Deliberate portable reading shape shared by the Settings JSON/CSV exports. */
export function createSettingsExportReadings(readings: readonly SettingsExportReading[]) {
  return readings.map(r => ({
    deviceSn: r.deviceSn, deviceName: r.deviceName, batteryLevel: r.batteryLevel,
    inputWatts: r.inputWatts, outputWatts: r.outputWatts,
    acInputWatts: r.acInputWatts, dcInputWatts: r.dcInputWatts,
    chargingType: r.chargingType, chargingTypeSource: r.chargingTypeSource, inputQuality: r.inputQuality,
    inputMeasurement: r.inputMeasurement, solarInputWatts: r.solarInputWatts,
    powerMeasurement: r.powerMeasurement, solarPanelInputWatts: r.solarPanelInputWatts,
    solarPanelReceivedAt: r.solarPanelReceivedAt, solarPanelMeasurement: r.solarPanelMeasurement,
    acOutputWatts: r.acOutputWatts, dcOutputWatts: r.dcOutputWatts, usbOutputWatts: r.usbOutputWatts,
    remainingTime: r.remainingTime, temperature: r.temperature, status: r.status,
    recordedAt: new Date(r.recordedAt).toISOString(),
    readingKind: r.readingKind, temperatureMeasurement: r.temperatureMeasurement,
  }));
}

export function createSettingsReadingsCsv(readings: readonly SettingsExportReading[]): string {
  const headers = [
    'deviceSn', 'deviceName', 'recordedAt', 'batteryLevel', 'inputWatts', 'outputWatts',
    'acInputWatts', 'dcInputWatts', 'acOutputWatts', 'dcOutputWatts', 'usbOutputWatts',
    'remainingTime', 'temperature', 'status', 'chargingType', 'chargingTypeSource', 'inputQuality', 'inputMeasurement', 'solarInputWatts',
    'powerMeasurement', 'solarPanelInputWatts', 'solarPanelReceivedAt', 'solarPanelMeasurement',
    'readingKind', 'temperatureMeasurement',
  ] as const;
  const rows = createSettingsExportReadings(readings).map(reading => headers.map(header =>
    `"${String(reading[header] ?? '').replace(/"/g, '""')}"`
  ).join(','));
  return [headers.join(','), ...rows].join('\n');
}
