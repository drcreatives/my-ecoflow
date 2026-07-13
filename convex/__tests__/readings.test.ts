import { describe, expect, it } from "vitest";
import { getHistoryRowCap, getHistorySampleWindows } from "../readings";

describe("reading history query limits", () => {
  it("caps long filtered ranges before legacy raw payloads exceed query limits", () => {
    const startTime = 1_700_000_000_000;
    const thirtyDaysLater = startTime + 30 * 24 * 60 * 60 * 1000;

    expect(getHistoryRowCap(startTime, thirtyDaysLater, 1)).toBe(500);
    expect(getHistoryRowCap(startTime, thirtyDaysLater, 5)).toBe(500);
  });

  it("keeps short raw ranges bounded to their expected reading count", () => {
    const startTime = 1_700_000_000_000;
    const oneHourLater = startTime + 60 * 60 * 1000;

    expect(getHistoryRowCap(startTime, oneHourLater, 1)).toBe(60);
  });

  it("returns zero for empty or inverted ranges", () => {
    expect(getHistoryRowCap(200, 200, 5)).toBe(0);
    expect(getHistoryRowCap(300, 200, 5)).toBe(0);
  });

  it("samples long ranges uniformly from start to end", () => {
    const startTime = 1_700_000_000_000;
    const thirtyDaysLater = startTime + 30 * 24 * 60 * 60 * 1000;
    const windows = getHistorySampleWindows(startTime, thirtyDaysLater, 5);

    expect(windows).toHaveLength(500);
    expect(windows?.[0].startTime).toBe(startTime);
    expect(windows?.at(-1)?.endTime).toBe(thirtyDaysLater);
    expect(windows?.[249].endTime).toBe(windows?.[250].startTime);
  });

  it("does not sample ranges that fit within the safe row cap", () => {
    const startTime = 1_700_000_000_000;
    const oneHourLater = startTime + 60 * 60 * 1000;

    expect(getHistorySampleWindows(startTime, oneHourLater, 1)).toBeNull();
  });

  it("samples according to the user's configured collection interval", () => {
    const startTime = 1_700_000_000_000;
    const oneDayLater = startTime + 24 * 60 * 60 * 1000;

    expect(getHistorySampleWindows(startTime, oneDayLater, 1)).toHaveLength(500);
    expect(getHistorySampleWindows(startTime, oneDayLater, 5)).toBeNull();
  });
});
