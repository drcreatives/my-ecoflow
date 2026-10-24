import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "../auth";
import { checkDeviceAlerts, remove } from "../devices";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const now = 1_800_000_000_000;
type Row = { _id: string; [field: string]: unknown };
type Args = Record<string, unknown>;
const device = { _id: "device-a", userId: "owner", deviceSn: "TEST-DEVICE", deviceName: "Station", isActive: true };
const power = { _id: "power", deviceId: device._id, recordedAt: now - 1_000, batteryLevel: 80 };
const thermal = { _id: "thermal", deviceId: device._id, readingKind: "temperature", temperatureMeasurement: "bms-generic-mqtt-v1", recordedAt: now, temperature: 60 };

function setup(options: { devices?: Row[]; readings?: Row[]; alerts?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    devices: options.devices ?? [{ ...device }], deviceReadings: options.readings ?? [{ ...power }],
    alerts: options.alerts ?? [], notificationSettings: [{ _id: "notifications", userId: "owner", lowBattery: true, lowBatteryThreshold: 20 }],
    deviceSettings: [], dailySummaries: [], deviceSchedules: [],
  };
  const indexes: Array<{ table: string; index: string; equalities: Array<[string, unknown]> }> = [];
  const ctx = {
    db: {
      get: vi.fn(async (id: string) => Object.values(tables).flat().find(row => row._id === id) ?? null),
      query: vi.fn((table: string) => {
        const filters: Array<(row: Row) => boolean> = [];
        const equalities: Array<[string, unknown]> = [];
        let direction = "asc";
        const range = {
          eq(field: string, value: unknown) { equalities.push([field, value]); filters.push(row => row[field] === value); return range; },
          gte(field: string, value: number) { filters.push(row => Number(row[field]) >= value); return range; },
        };
        const rows = () => tables[table].filter(row => filters.every(filter => filter(row)))
          .sort((left, right) => (Number(left.recordedAt ?? 0) - Number(right.recordedAt ?? 0)) * (direction === "asc" ? 1 : -1));
        const builder = {
          withIndex(index: string, configure: (query: typeof range) => unknown) { configure(range); indexes.push({ table, index, equalities }); return builder; },
          order(value: string) { direction = value; return builder; },
          collect: async () => rows(),
          first: async () => rows()[0] ?? null,
          filter(configure: (query: { field: (name: string) => string; eq: (field: string, value: unknown) => (row: Row) => boolean }) => (row: Row) => boolean) {
            filters.push(configure({ field: name => name, eq: (field, value) => row => row[field] === value })); return builder;
          },
        };
        return builder;
      }),
      insert: vi.fn(async (table: string, fields: Args) => { const id = `new-${tables[table].length}`; tables[table].push({ _id: id, ...fields }); return id; }),
      delete: vi.fn(async (id: string) => { for (const table of Object.values(tables)) { const index = table.findIndex(row => row._id === id); if (index >= 0) table.splice(index, 1); } }),
    },
    scheduler: { runAfter: vi.fn() }, runAction: vi.fn(), runMutation: vi.fn(),
  };
  return { ctx, tables, indexes };
}

function invoke<Result>(registered: unknown, ctx: ReturnType<typeof setup>["ctx"], args: Args = {}) {
  return (registered as { _handler: (context: typeof ctx, values: Args) => Promise<Result> })._handler(ctx, args);
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("DISABLE_CRONS", "false");
  vi.stubEnv("TEMPERATURE_COLLECTION_ENABLED", "true");
  vi.mocked(auth.getUserId).mockResolvedValue("owner" as Awaited<ReturnType<typeof auth.getUserId>>);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("temperature observation monitor compatibility", () => {
  it("pauses temperature alerts without stopping battery/offline checks or changing history", async () => {
    vi.stubEnv("TEMPERATURE_COLLECTION_ENABLED", undefined);
    const store = setup({ readings: [{ ...power, batteryLevel: 5, recordedAt: now - 31 * 60_000 }, thermal] });
    const before = structuredClone(store.tables.deviceReadings);
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 2 });
    expect(store.tables.alerts.map(alert => alert.type).sort()).toEqual(["BATTERY_LOW", "DEVICE_OFFLINE"]);
    expect(store.indexes.filter(request => request.table === "deviceReadings").every(request =>
      request.equalities.some(([field, value]) => field === "readingKind" && value === undefined))).toBe(true);
    expect(store.tables.deviceReadings).toEqual(before);
  });

  it("keeps battery/offline checks on power and alerts from a separate fresh verified temperature", async () => {
    const store = setup({ devices: [{ ...device, displayTelemetry: { temperature: { value: 60, source: "mqtt", receivedAt: now } } }],
      readings: [{ ...power, batteryLevel: 5, recordedAt: now - 31 * 60_000 }, thermal] });
    const before = structuredClone(store.tables.deviceReadings);
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 3 });
    expect(store.tables.alerts.map(alert => alert.type).sort()).toEqual(["BATTERY_LOW", "DEVICE_OFFLINE", "TEMPERATURE_HIGH"]);
    expect(store.indexes.filter(request => request.table === "deviceReadings")).toEqual([
      { table: "deviceReadings", index: "by_deviceId_readingKind_recordedAt", equalities: [["deviceId", device._id], ["readingKind", undefined]] },
      { table: "deviceReadings", index: "by_deviceId_readingKind_recordedAt", equalities: [["deviceId", device._id], ["readingKind", "temperature"]] },
    ]);
    expect(store.tables.alerts.find(alert => alert.type === "TEMPERATURE_HIGH")).toMatchObject({
      severity: "CRITICAL", message: "Station temperature is 60°C",
    });
    expect(store.tables.deviceReadings).toEqual(before);
    expect(store.ctx.runAction).not.toHaveBeenCalled();
    expect(store.ctx.runMutation).not.toHaveBeenCalled();
    expect(store.ctx.scheduler.runAfter).not.toHaveBeenCalled();
  });

  it("alerts on a thermal-only observation without manufacturing battery/offline state", async () => {
    const store = setup({ devices: [{ ...device, displayTelemetry: { temperature: { value: 51, source: "mqtt", receivedAt: now } } }], readings: [thermal] });
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 1 });
    expect(store.tables.alerts).toMatchObject([{ type: "TEMPERATURE_HIGH", severity: "CRITICAL" }]);
  });

  it.each([
    { value: 60, source: "mqtt", receivedAt: now - 6 * 60_000 - 1 },
    { value: 60, source: "rest-cache", receivedAt: now },
    { value: 60, source: "mqtt", receivedAt: now + 1 },
    { value: Number.NaN, source: "mqtt", receivedAt: now },
    { value: 60, source: "mqtt", receivedAt: Number.POSITIVE_INFINITY },
    { value: 60, source: "mqtt", receivedAt: -1 },
  ])("does not introduce display-based monitor alerts for any receipt (%j)", async temperature => {
    const store = setup({ devices: [{ ...device, displayTelemetry: { temperature } }], readings: [power] });
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 0 });
    expect(store.tables.alerts).toEqual([]);
  });

  it("does not use a PD-timed temperature snapshot as verified thermal evidence", async () => {
    const store = setup({ readings: [{ ...power, temperature: 55 }] });
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 0 });
    expect(store.tables.alerts).toEqual([]);
  });

  it.each([0, 45])("does not fall back to an older hot observation or power/cache value after a newer %s°C report", async temperature => {
    const store = setup({
      devices: [{ ...device, displayTelemetry: { temperature: { value: 60, source: "mqtt", receivedAt: now } } }],
      readings: [{ ...power, temperature: 60 }, { ...thermal, _id: "older-hot", recordedAt: now - 1_000 }, { ...thermal, temperature }],
    });
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 0 });
    expect(store.tables.alerts).toEqual([]);
  });

  it.each([
    { temperature: Number.NaN }, { temperature: Number.POSITIVE_INFINITY }, { temperature: Number.NEGATIVE_INFINITY },
    { temperatureMeasurement: undefined }, { temperatureMeasurement: "legacy-unverified" },
    { recordedAt: now + 1 }, { recordedAt: now - 6 * 60_000 - 1 },
    { recordedAt: Number.NaN }, { recordedAt: Number.POSITIVE_INFINITY }, { recordedAt: -1 },
  ])("rejects invalid/stale native evidence without falling back to a PD or cache snapshot (%j)", async invalid => {
    const store = setup({
      devices: [{ ...device, displayTelemetry: { temperature: { value: 60, source: "mqtt", receivedAt: now } } }],
      readings: [{ ...power, temperature: 60 }, { ...thermal, ...invalid }],
    });
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 0 });
    expect(store.tables.alerts).toEqual([]);
  });

  it.each([{ temperature: Number.NaN }, { temperatureMeasurement: undefined }, { recordedAt: now + 1 }])(
    "does not search behind the latest invalid observation for older hot native evidence (%j)", async invalid => {
      const store = setup({ readings: [power,
        { ...thermal, _id: "older-hot", recordedAt: now - 1_000 }, { ...thermal, ...invalid }],
      });
      expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 0 });
      expect(store.tables.alerts).toEqual([]);
    },
  );

  it.each([
    { temperature: 46, severity: "HIGH" }, { temperature: 55, severity: "HIGH" }, { temperature: 56, severity: "CRITICAL" },
  ])("preserves the %s native temperature threshold and severity", async ({ temperature, severity }) => {
    const store = setup({ readings: [power, { ...thermal, temperature, recordedAt: now - 6 * 60_000 }] });
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 1 });
    expect(store.tables.alerts).toMatchObject([{ type: "TEMPERATURE_HIGH", severity }]);
  });

  it("does not use a different device's temperature or run monitors for inactive devices", async () => {
    const store = setup({ devices: [{ ...device }, { ...device, _id: "inactive-device", isActive: false }],
      readings: [power, { ...thermal, deviceId: "other-device" }, { ...thermal, _id: "inactive-thermal", deviceId: "inactive-device" }],
    });
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 0 });
    expect(store.tables.alerts).toEqual([]);
  });

  it("keeps the one-hour temperature alert deduplication", async () => {
    const store = setup({ readings: [{ ...power, temperature: 60 }, thermal],
      alerts: [{ _id: "existing", deviceId: device._id, type: "TEMPERATURE_HIGH", createdAt: now - 1_000 }] });
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 0 });
    expect(store.ctx.db.insert).not.toHaveBeenCalled();
  });

  it("honors the development cron guard before any database access", async () => {
    vi.stubEnv("DISABLE_CRONS", "true");
    const store = setup();
    expect(await invoke(checkDeviceAlerts, store.ctx)).toEqual({ alertsCreated: 0, skipped: true });
    expect(store.ctx.db.query).not.toHaveBeenCalled();
  });

  it("continues deleting all observation kinds when an owner removes a device", async () => {
    const other = { ...thermal, _id: "other-thermal", deviceId: "other-device" };
    const store = setup({ readings: [power, thermal, other] });
    expect(await invoke(remove, store.ctx, { deviceId: device._id })).toEqual({ success: true });
    expect(store.tables.deviceReadings).toEqual([other]);
    expect(store.indexes.find(request => request.table === "deviceReadings")).toEqual({ table: "deviceReadings", index: "by_deviceId", equalities: [["deviceId", device._id]] });
  });
});
