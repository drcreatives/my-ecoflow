import { v, type Infer } from "convex/values";
import { calculateEnergyTotals, type EnergyReading, type EnergyTotals } from "../src/lib/analytics";
import { getVerifiedSolarPanelInput } from "../src/lib/reading-status";
import { chargingTypeSourceValidator, inputMeasurementValidator, inputQualityValidator } from "./readingQuality";

const nullableNumber = v.union(v.float64(), v.null());

export const historyReadingValidator = v.object({
  deviceId: v.id("devices"),
  deviceName: v.string(),
  deviceSn: v.string(),
  batteryLevel: nullableNumber,
  inputWatts: nullableNumber,
  acInputWatts: nullableNumber,
  dcInputWatts: nullableNumber,
  solarInputWatts: nullableNumber,
  chargingType: nullableNumber,
  chargingTypeSource: v.union(chargingTypeSourceValidator, v.null()),
  inputQuality: v.union(inputQualityValidator, v.null()),
  inputMeasurement: v.union(inputMeasurementValidator, v.null()),
  powerMeasurement: v.union(v.literal("pd-totals-mqtt-v1"), v.null()),
  solarPanelInputWatts: nullableNumber,
  solarPanelReceivedAt: nullableNumber,
  solarPanelMeasurement: v.union(v.literal("delta2-mppt-mqtt-v1"), v.null()),
  // Derived display values only: they never claim one sensor receipt for a bucket.
  solarPanelAverageWatts: v.optional(nullableNumber),
  solarPanelSampleCount: v.optional(v.float64()),
  sampleCount: v.optional(v.float64()),
  outputWatts: nullableNumber,
  acOutputWatts: nullableNumber,
  dcOutputWatts: nullableNumber,
  usbOutputWatts: nullableNumber,
  remainingTime: nullableNumber,
  temperature: nullableNumber,
  temperatureSampleCount: v.optional(v.float64()),
  status: v.string(),
  recordedAt: v.float64(),
});

export type HistoryReading = Infer<typeof historyReadingValidator>;

// An independent sensor stream. A bucket's timestamp is its start, not a claim
// that one physical sensor report arrived at that instant.
export const temperatureHistoryReadingValidator = v.object({
  deviceId: v.id("devices"),
  deviceName: v.string(),
  deviceSn: v.string(),
  temperature: v.float64(),
  recordedAt: v.float64(),
  temperatureSampleCount: v.float64(),
  temperatureMeasurement: v.union(v.literal("bms-generic-mqtt-v1"), v.null()),
});

export type TemperatureHistoryReading = Infer<typeof temperatureHistoryReadingValidator>;

export const energyTotalsValidator = v.object({
  consumed: v.float64(),
  acInput: v.float64(),
  solarInput: v.float64(),
  dcInput: v.float64(),
  totalInput: v.float64(),
  unattributedInput: v.float64(),
  sourceIntervals: v.float64(),
  solarIntervals: v.float64(),
  sourceCoveredMs: v.float64(),
  solarCoveredMs: v.float64(),
  solarPanelInput: v.float64(),
  solarPanelIntervals: v.float64(),
  solarPanelCoveredMs: v.float64(),
});

export const historyResultValidator = v.object({
  readings: v.array(historyReadingValidator),
  temperatureReadings: v.array(temperatureHistoryReadingValidator),
  temperatureSamplingIntervalMs: nullableNumber,
  temperatureSampledReadings: v.float64(),
  temperatureSummary: v.union(v.object({
    avgTemperature: v.float64(),
    maxTemperature: v.float64(),
    temperatureReadings: v.float64(),
  }), v.null()),
  summary: v.union(v.object({
    totalReadings: v.float64(),
    avgBatteryLevel: v.float64(),
    avgPowerOutput: v.float64(),
    avgTemperature: nullableNumber,
    temperatureReadings: v.float64(),
    peakPowerOutput: v.float64(),
    lowestBatteryLevel: v.float64(),
    highestTemperature: nullableNumber,
    startTime: v.float64(),
    endTime: v.float64(),
  }), v.null()),
  samplingIntervalMs: nullableNumber,
  energyTotals: v.union(energyTotalsValidator, v.null()),
  sampledReadings: v.float64(),
});

/** Integrate fetched raw samples per device, before chart aggregation. */
export function calculateHistoryEnergyTotals(
  readings: readonly (EnergyReading & { deviceId: string })[],
  samplingIntervalMs: number | null,
  options: Parameters<typeof calculateEnergyTotals>[3] = {},
  samplingIntervalsByDevice?: ReadonlyMap<string, number | null>,
): EnergyTotals {
  const byDevice = new Map<string, EnergyReading[]>();
  for (const reading of readings) {
    const deviceReadings = byDevice.get(reading.deviceId);
    if (deviceReadings) deviceReadings.push(reading);
    else byDevice.set(reading.deviceId, [reading]);
  }

  const totals = calculateEnergyTotals([], "raw", samplingIntervalMs, options);
  for (const [deviceId, deviceReadings] of byDevice) {
    const ordered = [...deviceReadings].sort((left, right) => left.recordedAt - right.recordedAt);
    // A dense station's sampling cannot widen a different station's offline gap.
    // Direct callers without the map retain the scalar sampling API.
    const deviceSamplingIntervalMs = samplingIntervalsByDevice
      ? samplingIntervalsByDevice.get(deviceId) ?? null : samplingIntervalMs;
    const deviceTotals = calculateEnergyTotals(ordered, "raw", deviceSamplingIntervalMs, options);
    for (const field of Object.keys(totals) as Array<keyof EnergyTotals>) {
      // Coverage is device-time: summing it cannot bridge two devices' samples.
      totals[field] += deviceTotals[field];
    }
  }
  return totals;
}

/** A partial bucket may display its verified PV sample mean with its coverage. */
export function getSolarPanelBucketSummary(readings: readonly (EnergyReading | HistoryReading)[]) {
  const verified = readings.flatMap((reading) => {
    const panel = getVerifiedSolarPanelInput(reading);
    return panel && Number.isFinite(reading.recordedAt) &&
      Math.abs(panel.receivedAt - reading.recordedAt) <= 5_000
      ? [panel.watts] : [];
  });
  return {
    solarPanelAverageWatts: verified.length > 0
      ? verified.reduce((sum, watts) => sum + watts, 0) / verified.length : null,
    solarPanelSampleCount: verified.length,
    sampleCount: readings.length,
  };
}
