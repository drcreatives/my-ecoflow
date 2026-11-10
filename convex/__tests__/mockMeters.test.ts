import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Id } from "../_generated/dataModel";
import { auth } from "../auth";
import { get, list, seed, setManualHold, simulateFleet, simulateUsage, topUp } from "../mockMeters";
import { createMockMeter, isMeterActive, settleMeter, MOCK_READING_LIMIT, INACTIVE_SIMULATION_AT, type MockMeter } from "../mockMeterModel";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const NOW = 1_800_000_000_000;
const OWNER = "owner" as Id<"users">;
type StoredRow = Record<string, unknown> & { _id: string; _creationTime: number };
type TableName = "mockMeters" | "mockMeterEvents" | "mockMeterReadings";

function makeContext() {
  let sequence = 0;
  const tables: Record<TableName, Map<string, StoredRow>> = {
    mockMeters: new Map(), mockMeterEvents: new Map(), mockMeterReadings: new Map(),
  };
  const insert = vi.fn(async (table: TableName, value: Record<string, unknown>) => {
    const id = `${table}-${++sequence}`;
    tables[table].set(id, { ...value, _id: id, _creationTime: NOW + sequence });
    return id;
  });
  const getRow = async (id: string) => {
    for (const table of Object.values(tables)) {
      const row = table.get(id);
      if (row) return { ...row };
    }
    return null;
  };
  const patch = vi.fn(async (id: string, value: Record<string, unknown>) => {
    for (const table of Object.values(tables)) {
      const row = table.get(id);
      if (row) table.set(id, { ...row, ...value });
    }
  });
  const remove = vi.fn(async (id: string) => {
    for (const table of Object.values(tables)) table.delete(id);
  });
  const query = vi.fn((table: TableName) => ({
    withIndex: (index: string, configure: (builder: {
      eq: (field: string, value: unknown) => unknown;
      lte: (field: string, value: number) => unknown;
    }) => unknown) => {
      const conditions: Array<(row: StoredRow) => boolean> = [];
      const builder = {
        eq(field: string, value: unknown) { conditions.push(row => row[field] === value); return builder; },
        lte(field: string, value: number) { conditions.push(row => Number(row[field]) <= value); return builder; },
      };
      configure(builder);
      let direction = 1;
      const sortField = index === "by_nextSimulationAt" ? "nextSimulationAt"
        : index === "by_meterId_recordedAt" ? "recordedAt" : "createdAt";
      const rows = () => [...tables[table].values()]
        .filter(row => conditions.every(condition => condition(row)))
        .sort((a, b) => direction * ((Number(a[sortField] ?? 0) - Number(b[sortField] ?? 0)) || a._creationTime - b._creationTime));
      const results = {
        order(value: string) { direction = value === "desc" ? -1 : 1; return results; },
        take: async (limit: number) => rows().slice(0, limit).map(row => ({ ...row })),
        first: async () => rows()[0] ?? null,
      };
      return results;
    },
  }));
  return { db: { insert, get: vi.fn(getRow), patch, delete: remove, query }, tables };
}

type TestContext = ReturnType<typeof makeContext>;
function handler<Args, Result>(registered: unknown) {
  return (registered as { _handler: (ctx: TestContext, args: Args) => Promise<Result> })._handler;
}
interface OperationResult { balanceWh: number; activated: boolean; duplicate: boolean }
interface UsageArgs { meterId: string; unitsWh: number; requestId: string }
const recharge = handler<UsageArgs, OperationResult>(topUp);
const consume = handler<UsageArgs, OperationResult>(simulateUsage);
const hold = handler<{ meterId: string; held: boolean; requestId: string }, OperationResult>(setManualHold);
const seedMeters = handler<Record<string, never>, { created: boolean; count: number }>(seed);
const listMeters = handler<Record<string, never>, Array<Record<string, unknown>>>(list);
const detail = handler<{ meterId: string }, {
  meter: Record<string, unknown>; events: Array<Record<string, unknown>>; readings: Array<Record<string, unknown>>;
} | null>(get);
const tick = handler<Record<string, never>, null>(simulateFleet);

async function addMeter(ctx: TestContext, patch: Partial<MockMeter> = {}) {
  return ctx.db.insert("mockMeters", { ...createMockMeter(OWNER, 0, NOW), ...patch });
}
function storedMeter(ctx: TestContext, meterId: string) {
  return ctx.tables.mockMeters.get(meterId)!;
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.mocked(auth.getUserId).mockResolvedValue(OWNER);
  vi.stubEnv("DISABLE_CRONS", "false");
  vi.stubEnv("DISABLE_MOCK_METER_SIMULATION", "false");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("mock prepaid meter accounting", () => {
  it("retains fractional usage across frequent settlements", () => {
    const initial = createMockMeter(OWNER, 0, NOW);
    const once = settleMeter(initial, NOW + 60_000);
    let frequent = initial;
    for (let seconds = 1; seconds <= 60; seconds++) frequent = settleMeter(frequent, NOW + seconds * 1_000);
    expect(frequent.balanceWh).toBe(initial.balanceWh - 2);
    expect(frequent.balanceWh).toBe(once.balanceWh);
    expect(frequent.remainderWattMs).toBe(once.remainderWattMs);
    expect(settleMeter(frequent, NOW + 60_000).balanceWh).toBe(frequent.balanceWh);
  });

  it("caps consumption at credit and preserves purchased equals used plus balance", () => {
    const initial = createMockMeter(OWNER, 0, NOW);
    const exhausted = settleMeter(initial, NOW + 24 * 3_600_000);
    expect(exhausted.balanceWh).toBe(0);
    expect(exhausted.usedWh).toBe(exhausted.purchasedWh);
    expect(exhausted.remainderWattMs).toBe(0);
    expect(isMeterActive(exhausted)).toBe(false);
  });

  it("does not consume held balances or treat offline connectivity as a power cutoff", () => {
    const initial = createMockMeter(OWNER, 0, NOW);
    expect(settleMeter({ ...initial, manualHold: true }, NOW + 60_000).balanceWh).toBe(initial.balanceWh);
    const offline = settleMeter({ ...initial, connectivity: "offline" }, NOW + 60_000);
    expect(offline.balanceWh).toBe(initial.balanceWh - 2);
    expect(offline.lastSeenAt).toBe(NOW);
    expect(isMeterActive(offline)).toBe(true);
    const fractional = settleMeter(initial, NOW + 1_000);
    const paused = settleMeter({ ...fractional, manualHold: true }, NOW + 60_000);
    expect(paused.remainderWattMs).toBe(fractional.remainderWattMs);
  });
});

describe("mock meter authentication and ownership", () => {
  it("returns empty query values and refuses every public write when signed out", async () => {
    const ctx = makeContext();
    vi.mocked(auth.getUserId).mockResolvedValue(null);
    expect(await listMeters(ctx, {})).toEqual([]);
    expect(await detail(ctx, { meterId: "missing" })).toBeNull();
    await expect(seedMeters(ctx, {})).rejects.toThrow("Unauthorized");
    await expect(recharge(ctx, { meterId: "missing", unitsWh: 100, requestId: "request-1" })).rejects.toThrow("Unauthorized");
    await expect(consume(ctx, { meterId: "missing", unitsWh: 100, requestId: "request-2" })).rejects.toThrow("Unauthorized");
    await expect(hold(ctx, { meterId: "missing", held: true, requestId: "request-3" })).rejects.toThrow("Unauthorized");
    expect(ctx.db.query).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("blocks another owner's detail, recharge, consumption and switching", async () => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx, { userId: "someone-else" as Id<"users"> });
    expect(await listMeters(ctx, {})).toEqual([]);
    expect(await detail(ctx, { meterId })).toBeNull();
    await expect(recharge(ctx, { meterId, unitsWh: 100, requestId: "request-1" })).rejects.toThrow("Meter not found");
    await expect(consume(ctx, { meterId, unitsWh: 100, requestId: "request-2" })).rejects.toThrow("Meter not found");
    await expect(hold(ctx, { meterId, held: true, requestId: "request-3" })).rejects.toThrow("Meter not found");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("seeds exactly fifty owner-scoped meters once with coherent totals and bounded history", async () => {
    const ctx = makeContext();
    expect(await seedMeters(ctx, {})).toEqual({ created: true, count: 50 });
    expect(await seedMeters(ctx, {})).toEqual({ created: false, count: 50 });
    const meters = await listMeters(ctx, {});
    expect(meters).toHaveLength(50);
    expect(ctx.tables.mockMeterReadings.size).toBe(50 * 24);
    expect(new Set(meters.map(meter => meter.meterNumber)).size).toBe(50);
    for (const meter of meters) {
      expect(meter.purchasedWh).toBe(Number(meter.usedWh) + Number(meter.balanceWh));
      expect(meter).not.toHaveProperty("userId");
      expect(meter).not.toHaveProperty("nextSimulationAt");
      expect(meter).not.toHaveProperty("_creationTime");
    }
    vi.mocked(auth.getUserId).mockResolvedValue("another-owner" as Id<"users">);
    expect(await listMeters(ctx, {})).toEqual([]);
    expect(await seedMeters(ctx, {})).toEqual({ created: true, count: 50 });
    expect(ctx.tables.mockMeters.size).toBe(100);
  });
});

describe("mock meter commands and receipts", () => {
  it("settles elapsed usage before recharging and automatically restores an exhausted meter", async () => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx, { balanceWh: 1, usedWh: 49_999 });
    vi.mocked(Date.now).mockReturnValue(NOW + 60_000);
    expect(await recharge(ctx, { meterId, unitsWh: 10_000, requestId: "recharge-1" }))
      .toEqual({ balanceWh: 10_000, activated: true, duplicate: false });
    expect(storedMeter(ctx, meterId)).toMatchObject({ purchasedWh: 60_000, usedWh: 50_000, paidKobo: 1_200_000 });
    expect([...ctx.tables.mockMeterEvents.values()].map(event => event.type))
      .toEqual(["automatic_deactivation", "top_up", "automatic_activation"]);
  });

  it("returns the original receipt on retry and rejects conflicting reuse", async () => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx);
    const args = { meterId, unitsWh: 1_000, requestId: "recharge-1" };
    const first = await recharge(ctx, args);
    await consume(ctx, { meterId, unitsWh: 100, requestId: "consume-1" });
    expect(await recharge(ctx, args)).toEqual({ ...first, duplicate: true });
    expect(storedMeter(ctx, meterId).balanceWh).toBe(1_350);
    await expect(recharge(ctx, { ...args, unitsWh: 2_000 })).rejects.toThrow("already used");
    await expect(consume(ctx, args)).rejects.toThrow("already used");
    const otherId = await addMeter(ctx);
    await expect(recharge(ctx, { ...args, meterId: otherId })).rejects.toThrow("already used");
  });

  it("keeps meter and receipt timestamps monotonic after a later settlement wins a race", async () => {
    const ctx = makeContext();
    const later = NOW + 5_000;
    const meterId = await addMeter(ctx, { lastSettledAt: later, lastSeenAt: later, lastReadingAt: later, updatedAt: later });
    await recharge(ctx, { meterId, unitsWh: 1_000, requestId: "recharge-1" });
    expect(storedMeter(ctx, meterId)).toMatchObject({ balanceWh: 1_450, lastSettledAt: later, lastReadingAt: later, nextSimulationAt: later + 60_000 });
    expect([...ctx.tables.mockMeterEvents.values()][0].createdAt).toBe(later);
  });

  it("preserves a manual hold across recharge and resumes only with credit", async () => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx);
    expect((await hold(ctx, { meterId, held: true, requestId: "disable-1" })).activated).toBe(false);
    expect((await recharge(ctx, { meterId, unitsWh: 5_000, requestId: "recharge-1" })).activated).toBe(false);
    expect((await hold(ctx, { meterId, held: false, requestId: "enable-1" })).activated).toBe(true);
    await consume(ctx, { meterId, unitsWh: 10_000, requestId: "consume-1" });
    await expect(hold(ctx, { meterId, held: false, requestId: "enable-2" })).rejects.toThrow("Recharge");
    expect(storedMeter(ctx, meterId).balanceWh).toBe(0);
  });

  it("caps explicit demo consumption and emits a single automatic cutoff", async () => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx);
    const args = { meterId, unitsWh: 1_000, requestId: "consume-1" };
    expect(await consume(ctx, args)).toEqual({ balanceWh: 0, activated: false, duplicate: false });
    expect(await consume(ctx, args)).toEqual({ balanceWh: 0, activated: false, duplicate: true });
    const events = [...ctx.tables.mockMeterEvents.values()];
    expect(events.filter(event => event.type === "automatic_deactivation")).toHaveLength(1);
    expect(events.find(event => event.type === "simulated_usage")?.unitsWh).toBe(450);
    await expect(consume(ctx, { ...args, requestId: "consume-2" })).rejects.toThrow("Activate");
    expect(storedMeter(ctx, meterId).usedWh).toBe(50_000);
    expect(storedMeter(ctx, meterId).nextSimulationAt).toBe(INACTIVE_SIMULATION_AT);
  });

  it.each([0, -1, 0.5, NaN, Infinity, 1_000_001])("rejects invalid energy input %s before changing balance", async (unitsWh) => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx);
    await expect(recharge(ctx, { meterId, unitsWh, requestId: "recharge-1" })).rejects.toThrow("whole watt-hours");
    await expect(consume(ctx, { meterId, unitsWh, requestId: "consume-1" })).rejects.toThrow("whole watt-hours");
    expect(ctx.db.patch).not.toHaveBeenCalled();
    expect(ctx.tables.mockMeterEvents.size).toBe(0);
  });

  it("rejects an absent idempotency key and hides private request metadata from detail", async () => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx);
    await expect(recharge(ctx, { meterId, unitsWh: 1_000, requestId: "" })).rejects.toThrow("identifier");
    await recharge(ctx, { meterId, unitsWh: 1_000, requestId: "private-request-key" });
    const response = await detail(ctx, { meterId });
    expect(JSON.stringify(response)).not.toContain("private-request-key");
    expect(JSON.stringify(response)).not.toContain("userId");
  });
});

describe("bounded mock simulation", () => {
  it.each(["DISABLE_CRONS", "DISABLE_MOCK_METER_SIMULATION"])("honors %s while allowing explicit mock operations", async variable => {
    vi.stubEnv(variable, "true");
    const ctx = makeContext();
    const meterId = await addMeter(ctx, { nextSimulationAt: NOW - 1 });
    await tick(ctx, {});
    expect(ctx.db.query).not.toHaveBeenCalled();
    expect((await consume(ctx, { meterId, unitsWh: 100, requestId: "consume-1" })).balanceWh).toBe(350);
  });

  it("processes the oldest fifty due meters fairly and never charges the same interval twice", async () => {
    const ctx = makeContext();
    for (let index = 0; index < 60; index++) await addMeter(ctx, { nextSimulationAt: NOW - 100 + index, lastSettledAt: NOW - 60_000 });
    await tick(ctx, {});
    expect([...ctx.tables.mockMeters.values()].filter(meter => meter.balanceWh === 448)).toHaveLength(50);
    await tick(ctx, {});
    expect([...ctx.tables.mockMeters.values()].filter(meter => meter.balanceWh === 448)).toHaveLength(60);
    await tick(ctx, {});
    expect(ctx.db.patch).toHaveBeenCalledTimes(60);
  });

  it("retains a fixed reading budget and keeps offline telemetry at its last reported time", async () => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx, { readingCount: MOCK_READING_LIMIT, nextSimulationAt: NOW - 1, lastReadingAt: NOW - 15 * 60_000 });
    for (let index = 0; index < MOCK_READING_LIMIT; index++) {
      await ctx.db.insert("mockMeterReadings", { meterId, recordedAt: NOW - (MOCK_READING_LIMIT - index) * 60_000, loadWatts: 120, usedWh: 49_550, balanceWh: 450 });
    }
    const offlineId = await addMeter(ctx, { connectivity: "offline", nextSimulationAt: NOW - 1, lastSettledAt: NOW - 60_000, lastSeenAt: NOW - 3_600_000 });
    await tick(ctx, {});
    expect(ctx.tables.mockMeterReadings.size).toBe(MOCK_READING_LIMIT);
    expect(storedMeter(ctx, meterId).readingCount).toBe(MOCK_READING_LIMIT);
    expect(storedMeter(ctx, offlineId)).toMatchObject({ balanceWh: 448, lastSeenAt: NOW - 3_600_000 });
    const result = await detail(ctx, { meterId });
    expect(result?.readings).toHaveLength(MOCK_READING_LIMIT);
    expect(result?.readings.at(-1)?.recordedAt).toBe(NOW);
  });

  it("samples at fifteen minutes and removes inactive meters from future due batches", async () => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx, { nextSimulationAt: NOW - 1, lastSettledAt: NOW - 60_000 });
    await tick(ctx, {});
    expect(ctx.tables.mockMeterReadings.size).toBe(0);
    await hold(ctx, { meterId, held: true, requestId: "disable-1" });
    expect(storedMeter(ctx, meterId).nextSimulationAt).toBe(INACTIVE_SIMULATION_AT);
    const writes = ctx.db.patch.mock.calls.length;
    vi.mocked(Date.now).mockReturnValue(NOW + 60_000);
    await tick(ctx, {});
    expect(ctx.db.patch).toHaveBeenCalledTimes(writes);
    expect(ctx.tables.mockMeterReadings.size).toBe(1);
    await hold(ctx, { meterId, held: false, requestId: "enable-1" });
    expect(storedMeter(ctx, meterId).nextSimulationAt).toBe(NOW + 120_000);
  });

  it("automatically cuts off once at exhaustion and resumes scheduling after recharge", async () => {
    const ctx = makeContext();
    const meterId = await addMeter(ctx, { balanceWh: 1, usedWh: 49_999, nextSimulationAt: NOW - 1, lastSettledAt: NOW - 60_000 });
    await tick(ctx, {});
    await tick(ctx, {});
    expect(storedMeter(ctx, meterId)).toMatchObject({ balanceWh: 0, usedWh: 50_000, nextSimulationAt: INACTIVE_SIMULATION_AT });
    expect(ctx.tables.mockMeterReadings.size).toBe(1);
    expect([...ctx.tables.mockMeterEvents.values()].map(event => event.type)).toEqual(["automatic_deactivation"]);
    await recharge(ctx, { meterId, unitsWh: 5_000, requestId: "recharge-1" });
    expect(storedMeter(ctx, meterId).nextSimulationAt).toBe(NOW + 60_000);
  });
});
