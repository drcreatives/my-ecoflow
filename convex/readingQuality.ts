import { v } from "convex/values";

// Consistency describes the reported power channels, not device measurement age.
export const inputQualityValidator = v.union(
  v.literal("consistent"),
  v.literal("inconsistent"),
  v.literal("incomplete")
);

export type InputQuality = "consistent" | "inconsistent" | "incomplete";

export const inputMeasurementValidator = v.union(
  v.literal("delta2-pd-v1"),
  v.literal("delta2-pd-mqtt-v1"),
  v.literal("legacy-modules")
);

export type InputMeasurement = "delta2-pd-v1" | "delta2-pd-mqtt-v1" | "legacy-modules";

export const dcInputSourceValidator = v.union(v.literal("auto"), v.literal("solar"), v.literal("adapter"));
export type DcInputSource = "auto" | "solar" | "adapter";

export const chargingTypeSourceValidator = v.union(v.literal("live-pd"), v.literal("device-setting"));
export type ChargingTypeSource = "live-pd" | "device-setting";
