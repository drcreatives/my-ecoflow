import { ConvexError, v, type ObjectType } from "convex/values";

export const MOCK_METER_COUNT = 50;
export const MOCK_READING_LIMIT = 96;
export const MOCK_TARIFF_KOBO_PER_KWH = 20_000;
export const SIMULATION_INTERVAL_MS = 60_000;
export const READING_INTERVAL_MS = 15 * 60_000;
export const INACTIVE_SIMULATION_AT = Number.MAX_SAFE_INTEGER;
const WATT_MILLISECONDS_PER_WH = 3_600_000;
const MAX_TRANSACTION_WH = 1_000_000;

export const connectivityValidator = v.union(v.literal("online"), v.literal("offline"));
export const eventTypeValidator = v.union(
  v.literal("seed"),
  v.literal("top_up"),
  v.literal("simulated_usage"),
  v.literal("manual_deactivation"),
  v.literal("manual_activation"),
  v.literal("automatic_deactivation"),
  v.literal("automatic_activation"),
);

export const mockMeterFields = {
  userId: v.id("users"),
  meterNumber: v.string(),
  customerName: v.string(),
  location: v.string(),
  connectivity: connectivityValidator,
  manualHold: v.boolean(),
  balanceWh: v.number(),
  purchasedWh: v.number(),
  usedWh: v.number(),
  paidKobo: v.number(),
  tariffKoboPerKwh: v.number(),
  loadWatts: v.number(),
  lastSeenAt: v.number(),
  lastSettledAt: v.number(),
  remainderWattMs: v.number(),
  nextSimulationAt: v.number(),
  readingCount: v.number(),
  lastReadingAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
};

export const mockMeterEventFields = {
  userId: v.id("users"),
  meterId: v.id("mockMeters"),
  type: eventTypeValidator,
  unitsWh: v.number(),
  amountKobo: v.number(),
  balanceWh: v.number(),
  activated: v.boolean(),
  message: v.string(),
  requestId: v.optional(v.string()),
  requestKey: v.optional(v.string()),
  createdAt: v.number(),
};

export const mockMeterReadingFields = {
  meterId: v.id("mockMeters"),
  recordedAt: v.number(),
  loadWatts: v.number(),
  usedWh: v.number(),
  balanceWh: v.number(),
};

export type MockMeter = ObjectType<typeof mockMeterFields>;

export function isMeterActive(meter: Pick<MockMeter, "balanceWh" | "manualHold">) {
  return meter.balanceWh > 0 && !meter.manualHold;
}

export function validateUnits(unitsWh: number) {
  if (!Number.isSafeInteger(unitsWh) || unitsWh <= 0 || unitsWh > MAX_TRANSACTION_WH) {
    throw new ConvexError("Enter between 0.001 and 1,000 kWh, in whole watt-hours.");
  }
}

export function validateRequestId(requestId: string) {
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) {
    throw new ConvexError("A valid request identifier is required.");
  }
}

/** Settle each interval once, carrying fractions so frequent actions cannot erase usage. */
export function settleMeter(meter: MockMeter, now: number): MockMeter {
  const elapsedMs = Math.max(0, now - meter.lastSettledAt);
  const energyWattMs = isMeterActive(meter)
    ? meter.loadWatts * elapsedMs + meter.remainderWattMs
    : meter.remainderWattMs;
  const consumedWh = Math.min(meter.balanceWh, Math.floor(energyWattMs / WATT_MILLISECONDS_PER_WH));
  const balanceWh = meter.balanceWh - consumedWh;
  return {
    ...meter,
    balanceWh,
    usedWh: meter.usedWh + consumedWh,
    remainderWattMs: balanceWh > 0 ? energyWattMs % WATT_MILLISECONDS_PER_WH : 0,
    lastSettledAt: Math.max(now, meter.lastSettledAt),
    nextSimulationAt: balanceWh > 0 && !meter.manualHold
      ? Math.max(now, meter.lastSettledAt) + SIMULATION_INTERVAL_MS : INACTIVE_SIMULATION_AT,
    lastSeenAt: meter.connectivity === "online" ? Math.max(now, meter.lastSeenAt) : meter.lastSeenAt,
    updatedAt: Math.max(now, meter.updatedAt),
  };
}

const FIRST_NAMES = ["Ada", "Tunde", "Chika", "Zainab", "Emeka", "Bisi", "Ibrahim", "Ngozi", "Femi", "Amina"];
const LAST_NAMES = ["Okoro", "Adeyemi", "Bello", "Nwosu", "Balogun"];
const LOCATIONS = ["Lekki, Lagos", "Ikeja, Lagos", "Wuse, Abuja", "Gwarinpa, Abuja", "GRA, Port Harcourt"];

export function createMockMeter(userId: MockMeter["userId"], index: number, now: number): MockMeter {
  const purchasedWh = 50_000 + (index * 7_919) % 180_000;
  let balanceWh = 5_000 + (index * 2_957) % 45_000;
  if (index === 0) balanceWh = 450;
  if (index % 10 === 6) balanceWh = 0;
  const connectivity = index % 7 === 3 ? "offline" : "online";
  return {
    userId,
    meterNumber: `PWR-${String(index + 1).padStart(4, "0")}`,
    customerName: `${FIRST_NAMES[index % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(index / FIRST_NAMES.length)]}`,
    location: LOCATIONS[index % LOCATIONS.length],
    connectivity,
    manualHold: index % 10 === 8,
    balanceWh,
    purchasedWh,
    usedWh: purchasedWh - balanceWh,
    paidKobo: Math.round(purchasedWh * MOCK_TARIFF_KOBO_PER_KWH / 1_000),
    tariffKoboPerKwh: MOCK_TARIFF_KOBO_PER_KWH,
    loadWatts: index === 0 ? 120 : 250 + (index * 137) % 2_000,
    lastSeenAt: connectivity === "online" ? now : now - (index + 1) * 60_000,
    lastSettledAt: now,
    remainderWattMs: 0,
    nextSimulationAt: balanceWh > 0 && index % 10 !== 8 ? now + SIMULATION_INTERVAL_MS : INACTIVE_SIMULATION_AT,
    readingCount: 0,
    lastReadingAt: connectivity === "online" ? now : now - (index + 1) * 60_000,
    createdAt: now,
    updatedAt: now,
  };
}
