import { describe, expect, it } from "vitest";
import {
  formatBatteryLevel,
  formatDeviceStatus,
  formatPowerValue,
  formatRemainingTime,
  formatTemperature,
} from "./data-utils";

describe("data formatting utilities", () => {
  it("formats power using watts and kilowatts", () => {
    expect(formatPowerValue(999)).toBe("999W");
    expect(formatPowerValue(1_250)).toBe("1.3kW");
  });

  it("rounds battery and temperature values for display", () => {
    expect(formatBatteryLevel(74.6)).toBe("75%");
    expect(formatTemperature(25.4)).toBe("25°C");
    expect(formatTemperature(0, "F")).toBe("32°F");
  });

  it("preserves the signed remaining-time convention", () => {
    expect(formatRemainingTime(95)).toBe("1h 35m until full");
    expect(formatRemainingTime(-1_500)).toBe("1d 1h remaining");
    expect(formatRemainingTime(0)).toBe("N/A");
    expect(formatRemainingTime(null)).toBe("N/A");
  });

  it("returns a safe fallback for unknown device status", () => {
    expect(formatDeviceStatus("unexpected")).toEqual({
      label: "Unknown",
      color: "gray",
      icon: "unknown",
    });
  });
});
