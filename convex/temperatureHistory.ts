import type { HistoryReading, TemperatureHistoryReading } from "./historyAnalytics";

/** Preserve actual observation times and prefer native evidence on exact ties. */
export function combineTemperatureObservations(
  powerReadings: readonly HistoryReading[],
  nativeReadings: readonly TemperatureHistoryReading[],
): TemperatureHistoryReading[] {
  const observations = new Map<string, TemperatureHistoryReading>();
  for (const reading of [...powerReadings, ...nativeReadings]) {
    if (typeof reading.temperature !== "number" || !Number.isFinite(reading.temperature) ||
        !Number.isFinite(reading.recordedAt)) continue;
    observations.set(`${reading.deviceId}:${reading.recordedAt}`, {
      deviceId: reading.deviceId, deviceName: reading.deviceName, deviceSn: reading.deviceSn,
      temperature: reading.temperature, recordedAt: reading.recordedAt,
      temperatureSampleCount: 1,
      temperatureMeasurement: "temperatureMeasurement" in reading
        ? reading.temperatureMeasurement : null,
    });
  }
  return [...observations.values()].sort((left, right) =>
    left.recordedAt - right.recordedAt || left.deviceId.localeCompare(right.deviceId));
}

/** Aggregate sensor observations independently of the sampled power timeline. */
export function aggregateTemperatureObservations(
  readings: readonly TemperatureHistoryReading[],
  aggregation: string,
): TemperatureHistoryReading[] {
  if (aggregation === "raw") return [...readings];
  const bucketMs = aggregation === "15m" ? 15 * 60_000
    : aggregation === "1h" ? 60 * 60_000 : aggregation === "1d" ? 24 * 60 * 60_000 : 5 * 60_000;
  const buckets = new Map<string, TemperatureHistoryReading[]>();
  for (const reading of readings) {
    const bucketStart = Math.floor(reading.recordedAt / bucketMs) * bucketMs;
    const key = `${reading.deviceId}:${bucketStart}`;
    const entries = buckets.get(key);
    if (entries) entries.push(reading);
    else buckets.set(key, [reading]);
  }
  return [...buckets.values()].map((entries) => ({
    ...entries[0],
    temperature: entries.reduce((sum, entry) => sum + entry.temperature, 0) / entries.length,
    recordedAt: Math.floor(entries[0].recordedAt / bucketMs) * bucketMs,
    temperatureSampleCount: entries.length,
    temperatureMeasurement: null,
  })).sort((left, right) =>
    left.recordedAt - right.recordedAt || left.deviceId.localeCompare(right.deviceId));
}
