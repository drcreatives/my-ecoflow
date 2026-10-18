import { describe, expect, it } from "vitest";
import { aggregateReadings, computeSummary } from "../readings";

function row(temperature: number | null) {
  return {
    batteryLevel: 80, inputWatts: 100, acInputWatts: 100, dcInputWatts: 0,
    chargingType: 3, inputQuality: "consistent" as const, outputWatts: 120,
    acOutputWatts: 100, dcOutputWatts: 15, usbOutputWatts: 5,
    remainingTime: null, temperature, status: "discharging", recordedAt: 1000,
  };
}

describe("temperature summary evidence", () => {
  it("reports missing-only temperature as unavailable, without changing other metrics or input allocation", () => {
    const rows = [row(null), row(null)];
    const before = structuredClone(rows);
    expect(computeSummary(rows, 0, 2000)).toMatchObject({
      totalReadings: 2, temperatureReadings: 0, avgTemperature: null,
      highestTemperature: null, avgBatteryLevel: 80, avgPowerOutput: 120,
    });
    expect(rows).toEqual(before);
  });

  it("counts only real finite temperatures and preserves an actual zero", () => {
    const rows = [row(null), row(0), row(36), row(Number.NaN), row(Number.POSITIVE_INFINITY)];
    expect(computeSummary(rows, 0, 2000)).toMatchObject({
      totalReadings: 5, temperatureReadings: 2, avgTemperature: 18, highestTemperature: 36,
    });
    expect(computeSummary([row(0)], 0, 2000)).toMatchObject({
      temperatureReadings: 1, avgTemperature: 0, highestTemperature: 0,
    });
  });

  it("describes displayed bucket coverage without filling a missing bucket from a neighboring report", () => {
    const rows = [row(null), { ...row(37), recordedAt: 400_000 }];
    const buckets = aggregateReadings(rows, "5m");
    expect(buckets.map(r => r.temperature)).toEqual([null, 37]);
    expect(computeSummary(buckets, 0, 500_000)).toMatchObject({
      totalReadings: 2, temperatureReadings: 1, avgTemperature: 37, highestTemperature: 37,
    });
  });
});
