import { describe, expect, it } from "vitest";
import type { DiagnosticFrame, MqttDiagnosticResult } from "../ecoflowMqttDiagnostics";
import { selectSolarPanelTelemetry } from "../solarPanelTelemetry";

const START = 1_800_000_000_000;
const PD_AT = START + 6_000;

function frame(
  moduleTime: number | null,
  offset: number,
  values: Record<string, number> = { inWatts: 226, chgType: 2 },
  overrides: Partial<DiagnosticFrame> = {},
): DiagnosticFrame {
  return {
    module: "mppt", moduleTime, receivedAt: START + offset, id: moduleTime,
    retained: false, duplicate: false, values, ...overrides,
  };
}

function capture(frames: DiagnosticFrame[], finishedOffset = 8_000) {
  return {
    startedAt: START, finishedAt: START + finishedOffset, frames,
  } satisfies Pick<MqttDiagnosticResult, "startedAt" | "finishedAt" | "frames">;
}

const pair = () => [frame(100, 3_000, { inWatts: 231, chgType: 2 }), frame(103, 6_000)];
const invalidSolarValues: Record<string, number>[] = [
  { inWatts: 226, chgType: 1 }, { inWatts: 226, chgType: 0 },
  { inWatts: 226, chgType: 255 }, { inWatts: 226 }, { chgType: 2 }, {},
  { inWatts: -1, chgType: 2 }, { inWatts: Number.NaN, chgType: 2 },
  { inWatts: Number.POSITIVE_INFINITY, chgType: 2 },
];

describe("selectSolarPanelTelemetry", () => {
  it("keeps panel watts separate from incomplete station allocation without clamping or deriving AC", () => {
    const pd = frame(200, 6_000, { wattsInSum: 221, wattsOutSum: 190 }, { module: "pd" });
    const result = selectSolarPanelTelemetry(capture([pair()[0], pd, pair()[1]]), PD_AT);
    expect(result).toEqual({
      solarPanelInputWatts: 226,
      solarPanelReceivedAt: PD_AT,
      solarPanelMeasurement: "delta2-mppt-mqtt-v1",
    });
    expect(pd.values).toEqual({ wattsInSum: 221, wattsOutSum: 190 });
    expect(result).not.toHaveProperty("acInputWatts");
    expect(result).not.toHaveProperty("dcInputWatts");
    expect(result).not.toHaveProperty("solarInputWatts");
  });

  it("does not change an explicit mixed same-PD station split", () => {
    const pd = frame(200, 6_000, { wattsInSum: 300, inputWatts: 100, wattsOutSum: 190 }, { module: "pd" });
    const original = { ...pd.values };
    expect(selectSolarPanelTelemetry(capture([
      frame(100, 3_000, { inWatts: 211, chgType: 2 }), pd,
      frame(103, 6_000, { inWatts: 210, chgType: 2 }),
    ]), PD_AT)?.solarPanelInputWatts).toBe(210);
    expect(pd.values).toEqual(original);
    expect(pd.values.wattsInSum - pd.values.inputWatts).toBe(200);
  });

  it("keeps an explicit genuine zero without substituting a previous positive value", () => {
    expect(selectSolarPanelTelemetry(capture([
      pair()[0], frame(103, 6_000, { inWatts: 0, chgType: 2 }),
    ]), PD_AT)?.solarPanelInputWatts).toBe(0);
  });

  it("returns the actual field receipt time, not the PD or finishing timestamp", () => {
    const result = selectSolarPanelTelemetry(capture(pair(), 10_000), PD_AT + 1_000);
    expect(result?.solarPanelReceivedAt).toBe(PD_AT);
  });

  it("requires two explicit solar pairs without merging partial fields", () => {
    expect(selectSolarPanelTelemetry(capture([frame(100, 3_000)]), PD_AT)).toBeNull();
    expect(selectSolarPanelTelemetry(capture([
      frame(100, 3_000, { inWatts: 226 }), frame(103, 6_000, { chgType: 2 }),
    ]), PD_AT)).toBeNull();
  });

  it.each(invalidSolarValues)("invalidates an earlier pair on a later adapter, unknown, or partial report (%j)", values => {
    expect(selectSolarPanelTelemetry(capture([...pair(), frame(106, 7_000, values)]), PD_AT)).toBeNull();
  });

  it("requires two new reports after an intervening non-solar report", () => {
    const sourceChange = [...pair(), frame(106, 6_500, { inWatts: 100, chgType: 1 }), frame(109, 7_000)];
    expect(selectSolarPanelTelemetry(capture(sourceChange), PD_AT)).toBeNull();
    expect(selectSolarPanelTelemetry(capture([...sourceChange, frame(112, 8_000)]), PD_AT))
      .toMatchObject({ solarPanelInputWatts: 226, solarPanelReceivedAt: START + 8_000 });
  });

  it.each(["retained", "duplicate"] as const)("ignores %s frames rather than promoting them as live evidence", flag => {
    expect(selectSolarPanelTelemetry(capture([pair()[0], frame(103, 6_000, undefined, { [flag]: true })]), PD_AT)).toBeNull();
    expect(selectSolarPanelTelemetry(capture([...pair(), frame(50, 7_000, { inWatts: 100, chgType: 1 }, { [flag]: true })]), PD_AT))
      .toMatchObject({ solarPanelInputWatts: 226, solarPanelReceivedAt: PD_AT });
  });

  it.each([100, 99, 0, null, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects replayed, reset, or invalid clocks (%s)", clock => {
    expect(selectSolarPanelTelemetry(capture([pair()[0], frame(clock, 6_000)]), PD_AT)).toBeNull();
  });

  it("never sorts reordered frames into apparent progress", () => {
    expect(selectSolarPanelTelemetry(capture([pair()[1], pair()[0]]), PD_AT)).toBeNull();
    expect(selectSolarPanelTelemetry(capture([...pair(), frame(99, 7_000), frame(106, 8_000)]), PD_AT)).toBeNull();
  });

  it("rejects regressing receipt times even when the module clock advances", () => {
    expect(selectSolarPanelTelemetry(capture([frame(100, 6_000), frame(103, 3_000)]), PD_AT)).toBeNull();
  });

  it.each([-1, 8_001, Number.NaN, Number.POSITIVE_INFINITY])("rejects out-of-session or invalid receipt offsets (%s)", offset => {
    expect(selectSolarPanelTelemetry(capture([pair()[0], frame(103, offset)]), PD_AT)).toBeNull();
  });

  it("rejects a stale panel pair or stale PD reference without refreshing their timestamps", () => {
    expect(selectSolarPanelTelemetry(capture(pair(), 17_000), PD_AT)).toBeNull();
    expect(selectSolarPanelTelemetry(capture([
      frame(100, 11_000), frame(103, 14_000),
    ], 17_000), PD_AT)).toBeNull();
  });

  it("requires both confirming MPPT receipts to be within five seconds of the PD receipt", () => {
    expect(selectSolarPanelTelemetry(capture([frame(100, 999), pair()[1]]), PD_AT)).toBeNull();
    expect(selectSolarPanelTelemetry(capture([frame(100, 1_000), pair()[1]]), PD_AT)).not.toBeNull();
    expect(selectSolarPanelTelemetry(capture([frame(100, 9_000), frame(103, 11_001)], 12_000), PD_AT)).toBeNull();
  });

  it("ignores unrelated module clocks and values", () => {
    expect(selectSolarPanelTelemetry(capture([
      pair()[0], frame(1, 4_000, { inWatts: 999, chgType: 2 }, { module: "inv" }), pair()[1],
    ]), PD_AT)?.solarPanelInputWatts).toBe(226);
  });

  it.each([START - 1, START + 8_001, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid PD references (%s)", at => {
    expect(selectSolarPanelTelemetry(capture(pair()), at)).toBeNull();
  });

  it("rejects reversed or nonfinite session bounds", () => {
    expect(selectSolarPanelTelemetry({ ...capture(pair()), startedAt: START + 9_000 }, PD_AT)).toBeNull();
    expect(selectSolarPanelTelemetry({ ...capture(pair()), finishedAt: Number.NaN }, PD_AT)).toBeNull();
  });
});
