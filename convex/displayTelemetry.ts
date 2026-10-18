import { v } from "convex/values";

export interface DisplayTelemetryEntry {
  value: number;
  source: "mqtt" | "rest-cache";
  // Receipt/fetch time only. REST cache has no known measurement timestamp.
  receivedAt: number;
}

export type DisplayTelemetryField = "temperature" | "acOutputWatts" | "dcOutputWatts" | "usbOutputWatts";
export type DisplayTelemetry = Partial<Record<DisplayTelemetryField, DisplayTelemetryEntry>>;

export const displayTelemetryEntryValidator = v.object({
  value: v.float64(),
  source: v.union(v.literal("mqtt"), v.literal("rest-cache")),
  receivedAt: v.float64(),
});

export const displayTelemetryValidator = v.object({
  temperature: v.optional(displayTelemetryEntryValidator),
  acOutputWatts: v.optional(displayTelemetryEntryValidator),
  dcOutputWatts: v.optional(displayTelemetryEntryValidator),
  usbOutputWatts: v.optional(displayTelemetryEntryValidator),
});

const FIELDS: DisplayTelemetryField[] = ["temperature", "acOutputWatts", "dcOutputWatts", "usbOutputWatts"];

/** Merge display reports without turning cached values into fresh readings. */
export function mergeDisplayTelemetry(
  current: DisplayTelemetry | undefined,
  incoming: DisplayTelemetry,
): DisplayTelemetry | undefined {
  let merged = current;
  for (const field of FIELDS) {
    const next = incoming[field];
    if (!next) continue;
    if (!Number.isFinite(next.value) || !Number.isFinite(next.receivedAt) || next.receivedAt < 0 ||
      (next.source !== "mqtt" && next.source !== "rest-cache")) {
      throw new Error("Invalid display telemetry");
    }
    const previous = current?.[field];
    if (previous && (next.receivedAt < previous.receivedAt ||
      (previous.source === "mqtt" && next.source === "rest-cache"))) continue;
    if (previous?.value === next.value && previous.source === next.source && previous.receivedAt === next.receivedAt) continue;
    merged = { ...merged, [field]: { value: next.value, source: next.source, receivedAt: next.receivedAt } };
  }
  return merged;
}
