import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../_generated/server";
import { cleanupOldReadings, continueCleanup } from "../admin";

const now = 1_800_000_000_000;
const day = 24 * 60 * 60 * 1000;
type Table = "users" | "devices" | "dataRetentionSettings" | "deviceReadings" | "alerts" | "notificationLogs" | "googleDriveConnections";
interface Row { _id: string; _creationTime: number; [field: string]: unknown }
interface Work {
  runStartedAt: number;
  state: {
    stage: "users" | "devices" | "readings" | "alerts" | "logs";
    userId?: string;
    cursor?: string | null;
    nextUserCursor?: string | null;
    cutoffMs?: number;
    deviceId?: string;
    nextDeviceCursor?: string | null;
  };
}
interface Result { totalDeleted: number; scheduled: boolean; skipped?: boolean }
const start = (cleanupOldReadings as unknown as {
  _handler: (ctx: MutationCtx, args: Record<string, never>) => Promise<Result>;
})._handler;
const resume = (continueCleanup as unknown as {
  _handler: (ctx: MutationCtx, args: Work) => Promise<Result>;
})._handler;

const document = (id: string, values: Record<string, unknown> = {}): Row => ({
  _id: id, _creationTime: 1, ...values,
});
const owner = (id = "owner") => document(id);
const device = (id = "device", userId = "owner") => document(id, { userId });
const policy = (userId = "owner", retentionPeriodDays = 90, autoCleanupEnabled = true) => document(`settings-${userId}`, {
  userId, retentionPeriodDays, autoCleanupEnabled, backupEnabled: false, collectionIntervalMinutes: 5,
});
const reading = (id: string, ageDays: number, deviceId = "device") => document(id, {
  deviceId, recordedAt: now - ageDays * day,
});

function makeStore(seed: Partial<Record<Table, Row[]>> = {}, options: { emptyOversizePage?: boolean } = {}) {
  const tables: Record<Table, Row[]> = {
    users: [owner()], devices: [device()], dataRetentionSettings: [policy()],
    deviceReadings: [], alerts: [], notificationLogs: [], googleDriveConnections: [], ...seed,
  };
  const queue: Work[] = [];
  const deleted: string[] = [];
  const pages: Array<{ table: Table; rows: number; bytes: number; numItems: number; maximumRowsRead: number; maximumBytesRead: number }> = [];
  let transactionDeletes = 0;
  let maxTransactionDeletes = 0;
  let transactionPages = 0;
  let maxTransactionPages = 0;
  let totalDeleted = 0;
  const find = (id: string) => Object.values(tables).flat().find((row) => row._id === id) ?? null;
  const query = vi.fn((table: Table) => {
    const filters: Array<(row: Row) => boolean> = [];
    let sortFields = ["_creationTime", "_id"];
    const range = {
      eq: (field: string, value: unknown) => { filters.push((row) => row[field] === value); return range; },
      lt: (field: string, value: number) => { filters.push((row) => (row[field] as number) < value); return range; },
      lte: (field: string, value: number) => { filters.push((row) => (row[field] as number) <= value); return range; },
    };
    const key = (row: Row): Array<string | number> => sortFields.map((field) => row[field] as string | number);
    const compare = (a: Array<string | number>, b: Array<string | number>) => {
      for (let index = 0; index < a.length; index++) {
        if (a[index] < b[index]) return -1;
        if (a[index] > b[index]) return 1;
      }
      return 0;
    };
    const selected = () => tables[table].filter((row) => filters.every((filter) => filter(row)))
      .sort((a, b) => compare(key(a), key(b)));
    const builder = {
      withIndex: (name: string, configure: (q: typeof range) => unknown) => {
        sortFields = [...name.replace(/^by_/, "").split("_").filter((field) => field !== "creation" && field !== "time"), "_creationTime", "_id"];
        configure(range);
        return builder;
      },
      first: vi.fn(async () => selected()[0] ?? null),
      paginate: vi.fn(async (opts: { cursor: string | null; numItems: number; maximumRowsRead: number; maximumBytesRead: number }) => {
        transactionPages++;
        maxTransactionPages = Math.max(maxTransactionPages, transactionPages);
        const cursorKey = opts.cursor ? JSON.parse(opts.cursor) as Array<string | number> : null;
        const candidates = selected().filter((row) => cursorKey === null || compare(key(row), cursorKey) > 0);
        const page: Row[] = [];
        let bytes = 0;
        for (const row of candidates) {
          const size = JSON.stringify(row).length;
          if (options.emptyOversizePage && page.length === 0 && size > opts.maximumBytesRead) break;
          if (page.length >= opts.numItems || page.length >= opts.maximumRowsRead || bytes >= opts.maximumBytesRead) break;
          page.push(row);
          bytes += size;
        }
        pages.push({ table, rows: page.length, bytes, ...opts });
        return {
          page, isDone: page.length === candidates.length,
          continueCursor: page.length ? JSON.stringify(key(page[page.length - 1])) : opts.cursor ?? "",
        };
      }),
      collect: vi.fn(() => { throw new Error("Unbounded collect is forbidden during cleanup"); }),
    };
    return builder;
  });
  const db = {
    query,
    get: vi.fn(async (id: string) => find(id)),
    delete: vi.fn(async (id: string) => {
      for (const rows of Object.values(tables)) {
        const index = rows.findIndex((row) => row._id === id);
        if (index !== -1) rows.splice(index, 1);
      }
      deleted.push(id);
      transactionDeletes++;
      maxTransactionDeletes = Math.max(maxTransactionDeletes, transactionDeletes);
    }),
    patch: vi.fn(async (id: string, values: Record<string, unknown>) => { Object.assign(find(id)!, values); }),
    insert: vi.fn(async (table: Table, values: Record<string, unknown>) => {
      const row = document(`inserted-${table}-${tables[table].length}`, values);
      tables[table].push(row);
      return row._id;
    }),
  };
  const scheduler = {
    runAfter: vi.fn(async (_delay: number, _reference: unknown, args: Work) => { queue.push(args); return "scheduled"; }),
  };
  const ctx = { db, scheduler } as unknown as MutationCtx;
  const transaction = async (fn: () => Promise<Result>) => {
    transactionDeletes = 0;
    transactionPages = 0;
    // Approximate Convex mutation atomicity for regression checks on failures.
    const snapshot = structuredClone(tables);
    const deletedBefore = deleted.length;
    const queueBefore = queue.length;
    try {
      const result = await fn();
      totalDeleted += result.totalDeleted;
      return result;
    } catch (error) {
      Object.assign(tables, snapshot);
      deleted.length = deletedBefore;
      queue.length = queueBefore;
      throw error;
    }
  };
  const next = async () => {
    const args = queue.shift();
    if (!args) throw new Error("No scheduled cleanup");
    return transaction(() => resume(ctx, args));
  };
  const drain = async () => {
    let batches = 0;
    while (queue.length) {
      if (++batches > 1000) throw new Error("Cleanup did not terminate");
      await next();
    }
  };
  return {
    ctx, db, scheduler, tables, queue, deleted, pages, start: () => transaction(() => start(ctx, {})), next, drain,
    get totalDeleted() { return totalDeleted; },
    get maxTransactionDeletes() { return maxTransactionDeletes; },
    get maxTransactionPages() { return maxTransactionPages; },
  };
}

beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(now); vi.stubEnv("DISABLE_CRONS", "false"); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("bounded retention cleanup", () => {
  it("advances only the deleting owner's export revision once per committed readings batch", async () => {
    const store = makeStore({
      users: [owner(), document("second", { readingDeletionRevision: 7 })],
      devices: [device(), device("second-device", "second")],
      dataRetentionSettings: [policy(), policy("second")],
      deviceReadings: Array.from({ length: 235 }, (_, index) => reading(`expired-${index}`, 91)),
      alerts: [document("expired-alert", { deviceId: "second-device", createdAt: now - 91 * day })],
    });
    await store.start(); await store.drain();
    expect(store.tables.users[0].readingDeletionRevision).toBe(3);
    expect(store.tables.users[1].readingDeletionRevision).toBe(7);
    expect(store.deleted).toHaveLength(236);
  });

  it("advances the revision when an archived deletion batch defers unarchived rows", async () => {
    const watermark = now - day;
    const store = makeStore({
      dataRetentionSettings: [{ ...policy(), backupEnabled: true, lastCompleteBackupAt: watermark }],
      deviceReadings: [reading("archived", 100), { ...reading("unarchived", 100), _creationTime: watermark + 1 }],
    });
    await store.start(); await store.drain();
    expect(store.deleted).toEqual(["archived"]);
    expect(store.tables.users[0].readingDeletionRevision).toBe(1);
    expect(store.tables.deviceReadings.map(row => row._id)).toEqual(["unarchived"]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])("preserves readings when the stored deletion revision cannot advance safely (%s)", async revision => {
    const store = makeStore({ users: [document("owner", { readingDeletionRevision: revision })], deviceReadings: [reading("protected", 100)] });
    await store.start(); await store.next();
    await expect(store.next()).rejects.toThrow("Invalid reading deletion revision");
    expect(store.deleted).toEqual([]);
    expect(store.tables.deviceReadings).toHaveLength(1);
    expect(store.tables.users[0].readingDeletionRevision).toBe(revision);
  });

  it("rolls back a deletion and its revision together if continuation scheduling fails", async () => {
    const store = makeStore({ deviceReadings: [reading("protected", 100)] });
    await store.start(); await store.next();
    store.scheduler.runAfter.mockRejectedValueOnce(new Error("Scheduler unavailable"));
    await expect(store.next()).rejects.toThrow("Scheduler unavailable");
    expect(store.deleted).toEqual([]);
    expect(store.tables.deviceReadings).toHaveLength(1);
    expect(store.tables.users[0].readingDeletionRevision).toBeUndefined();
  });

  it("deletes a multi-page backlog while preserving exact-cutoff and newer readings in every device", async () => {
    const expired = Array.from({ length: 235 }, (_, i) => reading(`expired-${i}`, 91));
    const store = makeStore({
      devices: [device(), device("other-device")],
      deviceReadings: [...expired, reading("boundary", 90), reading("recent", 1), reading("other-old", 91, "other-device")],
      alerts: [document("alert-old", { deviceId: "device", createdAt: now - 91 * day }), document("alert-boundary", { deviceId: "device", createdAt: now - 90 * day })],
      notificationLogs: [document("log-old", { userId: "owner", sentAt: now - 91 * day }), document("log-boundary", { userId: "owner", sentAt: now - 90 * day })],
    });
    expect(await store.start()).toEqual({ totalDeleted: 0, scheduled: true });
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
    await store.drain();
    expect(store.totalDeleted).toBe(238);
    expect(store.tables.deviceReadings.map((row) => row._id)).toEqual(["boundary", "recent"]);
    expect(store.tables.alerts.map((row) => row._id)).toEqual(["alert-boundary"]);
    expect(store.tables.notificationLogs.map((row) => row._id)).toEqual(["log-boundary"]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBe(now);
    expect(store.maxTransactionDeletes).toBe(100);
    expect(store.maxTransactionPages).toBe(1);
    expect(store.pages.every((page) => page.maximumRowsRead <= 100 && page.maximumBytesRead ===
      (page.table === "users" || page.table === "devices" ? 2 * 1024 * 1024 : 512 * 1024))).toBe(true);
  });

  it("bounds legacy raw payload pages by bytes and progresses when an individual document exceeds the budget", async () => {
    const legacy = Array.from({ length: 4 }, (_, i) => ({ ...reading(`legacy-${i}`, 91), rawData: { payload: "x".repeat(800_000) } }));
    const store = makeStore({ deviceReadings: [...legacy, reading("keep", 90)] });
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual(legacy.map((row) => row._id));
    expect(store.maxTransactionDeletes).toBe(1);
    expect(store.pages.every((page) => page.bytes < 512 * 1024 + 1024 * 1024)).toBe(true);
    const fallback = makeStore({ deviceReadings: legacy }, { emptyOversizePage: true });
    await fallback.start();
    await fallback.drain();
    expect(fallback.deleted).toHaveLength(4);
    expect(fallback.tables.dataRetentionSettings[0].lastCleanup).toBe(now);
  });

  it("honors distinct owners' 30-day and 730-day windows including inactive devices", async () => {
    const store = makeStore({
      users: [owner("short"), owner("long")],
      devices: [{ ...device("short-device", "short"), isActive: false }, device("long-device", "long")],
      dataRetentionSettings: [policy("short", 30), policy("long", 730)],
      deviceReadings: [reading("short-old", 31, "short-device"), reading("short-keep", 30, "short-device"), reading("long-old", 731, "long-device"), reading("long-keep", 100, "long-device")],
    });
    await store.start();
    await store.drain();
    expect(store.deleted.sort()).toEqual(["long-old", "short-old"]);
    expect(store.tables.dataRetentionSettings.every((row) => row.lastCleanup === now)).toBe(true);
  });

  it("uses the advertised 90-day defaults for owners without saved settings", async () => {
    const store = makeStore({ dataRetentionSettings: [], deviceReadings: [reading("old", 91), reading("keep", 90)] });
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual(["old"]);
    expect(store.tables.dataRetentionSettings[0]).toMatchObject({
      userId: "owner", retentionPeriodDays: 90, autoCleanupEnabled: true, lastCleanup: now,
      backupEnabled: false, backupIntervalHours: 24, collectionIntervalMinutes: 5,
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.5])("fails closed on an invalid retention setting (%s)", async (days) => {
    const store = makeStore({ dataRetentionSettings: [policy("owner", days)], deviceReadings: [reading("old", 100)] });
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual([]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
  });

  it.each([
    { retentionPeriodDays: undefined },
    { retentionPeriodDays: null },
    { autoCleanupEnabled: "false" },
    { autoCleanupEnabled: undefined },
  ])("does not substitute defaults for a malformed existing policy (%j)", async (invalid) => {
    const store = makeStore({ dataRetentionSettings: [{ ...policy(), ...invalid }], deviceReadings: [reading("protected", 100)] });
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual([]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
  });

  it("rechecks disable and retention expansion before every queued batch", async () => {
    for (const change of ["disable", "expand"] as const) {
      const store = makeStore({ deviceReadings: Array.from({ length: 205 }, (_, i) => reading(`old-${i}`, 100)) });
      await store.start();
      await store.next(); // devices
      await store.next(); // first readings page
      expect(store.deleted).toHaveLength(100);
      if (change === "disable") store.tables.dataRetentionSettings[0].autoCleanupEnabled = false;
      else store.tables.dataRetentionSettings[0].retentionPeriodDays = 180;
      await store.drain();
      expect(store.deleted).toHaveLength(100);
      expect(store.tables.deviceReadings).toHaveLength(105);
      expect(store.tables.dataRetentionSettings[0].lastCleanup).toBe(change === "disable" ? undefined : now);
    }
  });

  it("keeps a fixed upper cutoff when time advances or retention shrinks during the run", async () => {
    const store = makeStore({ deviceReadings: [reading("expired", 100), reading("in-window", 89), reading("recent", 40)] });
    await store.start();
    await store.next(); // establishes the original 90-day cutoff
    vi.mocked(Date.now).mockReturnValue(now + 2 * day);
    store.tables.dataRetentionSettings[0].retentionPeriodDays = 30;
    await store.drain();
    expect(store.deleted).toEqual(["expired"]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBe(now + 2 * day);
  });

  it.each(["transfer", "remove-device", "remove-owner"])("verifies ownership before a scheduled delete (%s)", async (change) => {
    const store = makeStore({ deviceReadings: [reading("protected", 100)] });
    await store.start();
    await store.next();
    if (change === "transfer") store.tables.devices[0].userId = "another-owner";
    if (change === "remove-device") store.tables.devices.length = 0;
    if (change === "remove-owner") store.tables.users.length = 0;
    await store.drain();
    expect(store.deleted).toEqual([]);
  });

  it("honors DISABLE_CRONS at the coordinator and after continuations are queued", async () => {
    const store = makeStore({ deviceReadings: [reading("protected", 100)] });
    vi.stubEnv("DISABLE_CRONS", "true");
    expect(await store.start()).toEqual({ totalDeleted: 0, scheduled: false, skipped: true });
    expect(store.db.query).not.toHaveBeenCalled();
    vi.stubEnv("DISABLE_CRONS", "false");
    await store.start();
    await store.next();
    vi.stubEnv("DISABLE_CRONS", "true");
    await store.drain();
    expect(store.deleted).toEqual([]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
  });

  it("does not mark cleanup complete after a failed deletion or continuation scheduling", async () => {
    for (const fail of ["delete", "schedule"] as const) {
      const store = makeStore({ deviceReadings: [reading("old", 100)] });
      await store.start();
      await store.next();
      if (fail === "delete") store.db.delete.mockRejectedValueOnce(new Error("write failed"));
      else store.scheduler.runAfter.mockRejectedValueOnce(new Error("schedule failed"));
      await expect(store.next()).rejects.toThrow("failed");
      expect(store.tables.deviceReadings.map((row) => row._id)).toEqual(["old"]);
      expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
    }
  });

  it("terminates overlapping completed runs without duplicate deletes or rescheduling loops", async () => {
    const store = makeStore({ deviceReadings: [reading("old", 100)] });
    await store.start();
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual(["old"]);
    expect(store.queue).toEqual([]);
  });

  it("does not overwrite a retention preference saved after a default-policy run began", async () => {
    const store = makeStore({ dataRetentionSettings: [], deviceReadings: [reading("protected", 100)] });
    await store.start();
    await store.next();
    store.tables.dataRetentionSettings.push(policy("owner", 730));
    await store.drain();
    expect(store.deleted).toEqual([]);
    expect(store.tables.dataRetentionSettings).toHaveLength(1);
    expect(store.tables.dataRetentionSettings[0].retentionPeriodDays).toBe(730);
    expect(store.db.insert).not.toHaveBeenCalled();
  });

  it("holds an owner's active backup without blocking other owners, then cleans up after the backup clears", async () => {
    const store = makeStore({
      users: [owner(), owner("second")],
      devices: [device(), device("second-device", "second")],
      dataRetentionSettings: [{ ...policy(), backupRun: { token: "active-backup" } }, policy("second", 30)],
      deviceReadings: [reading("backup-protected", 100), reading("second-old", 31, "second-device")],
    });
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual(["second-old"]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
    expect(store.tables.dataRetentionSettings[1].lastCleanup).toBe(now);

    // Completion or explicitly disabling backups clears this private run state.
    delete store.tables.dataRetentionSettings[0].backupRun;
    vi.mocked(Date.now).mockReturnValue(now + day);
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual(["second-old", "backup-protected"]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBe(now + day);
  });

  it("rechecks an active backup before the next queued deletion batch", async () => {
    const store = makeStore({ deviceReadings: Array.from({ length: 205 }, (_, i) => reading(`old-${i}`, 100)) });
    await store.start();
    await store.next();
    await store.next();
    expect(store.deleted).toHaveLength(100);
    store.tables.dataRetentionSettings[0].backupRun = { token: "new-backup" };
    await store.drain();
    expect(store.deleted).toHaveLength(100);
    expect(store.tables.deviceReadings).toHaveLength(105);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
  });

  it("holds legacy-only backup timestamps until a complete archive exists while other owners continue", async () => {
    const store = makeStore({
      users: [owner(), owner("second")],
      devices: [device(), device("second-device", "second")],
      dataRetentionSettings: [{ ...policy(), backupEnabled: true, lastBackupAt: now }, policy("second")],
      deviceReadings: [reading("unarchived", 100), reading("second-old", 100, "second-device")],
    });
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual(["second-old"]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
    expect(store.tables.dataRetentionSettings[1].lastCleanup).toBe(now);

    store.tables.dataRetentionSettings[0].lastCompleteBackupAt = now;
    vi.mocked(Date.now).mockReturnValue(now + day);
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual(["second-old", "unarchived"]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBe(now + day);
  });

  it("preserves expired but unarchived monthly readings before the hourly backup claim", async () => {
    const watermark = now - 30 * day - 15 * 60_000;
    const store = makeStore({
      dataRetentionSettings: [{ ...policy("owner", 30), backupEnabled: true, lastCompleteBackupAt: watermark, backupIntervalHours: 720 }],
      deviceReadings: [
        reading("archived-old", 31),
        { ...reading("watermark-boundary", 31), recordedAt: watermark },
        { ...reading("due-unarchived", 31), recordedAt: watermark + 5 * 60_000, _creationTime: watermark + 5 * 60_000 },
        reading("retention-boundary", 30), reading("recent", 29),
      ],
    });
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual(["archived-old"]);
    expect(store.tables.deviceReadings.map((row) => row._id)).toEqual([
      "watermark-boundary", "due-unarchived", "retention-boundary", "recent",
    ]);
  });

  it("preserves new backfilled old readings and defers the owner without looping or stamping completion", async () => {
    const watermark = now - 2 * day;
    const store = makeStore({
      users: [owner(), owner("second")],
      devices: [device(), device("second-device", "second")],
      dataRetentionSettings: [{ ...policy(), backupEnabled: true, lastCompleteBackupAt: watermark }, policy("second")],
      deviceReadings: [
        reading("archived-expired", 100),
        { ...reading("unarchived-backfill", 100), _creationTime: watermark + 1 },
        reading("second-old", 100, "second-device"),
      ],
    });
    await store.start();
    await store.drain();
    expect(store.deleted.sort()).toEqual(["archived-expired", "second-old"]);
    expect(store.tables.deviceReadings.map((row) => row._id)).toEqual(["unarchived-backfill"]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
    expect(store.tables.dataRetentionSettings[1].lastCleanup).toBe(now);
    expect(store.queue).toEqual([]);
  });

  it.each([0, -1, Number.NaN, now + 1])("fails closed on an invalid complete-backup watermark (%s)", async (watermark) => {
    const store = makeStore({
      dataRetentionSettings: [{ ...policy(), backupEnabled: true, lastCompleteBackupAt: watermark }],
      deviceReadings: [reading("protected", 100)],
    });
    await store.start();
    await store.drain();
    expect(store.deleted).toEqual([]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
  });

  it("holds the first Drive archive even when an earlier email archive completed", async () => {
    const store = makeStore({
      dataRetentionSettings: [{ ...policy(), backupEnabled: true, backupDestination: "googleDrive", lastCompleteBackupAt: now }],
      googleDriveConnections: [document("grant", { userId: "owner", encryptedRefreshToken: "encrypted-placeholder" })],
      deviceReadings: [reading("protected", 100)],
    });
    await store.start(); await store.drain();
    expect(store.deleted).toEqual([]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
  });

  it.each(["missing", "revoked"])("holds cleanup when the Drive grant is %s", async state => {
    const store = makeStore({
      dataRetentionSettings: [{ ...policy(), backupEnabled: true, backupDestination: "googleDrive", lastCompleteBackupAt: now, lastDriveBackupAt: now }],
      googleDriveConnections: state === "revoked" ? [document("grant", { userId: "owner", encryptedRefreshToken: "encrypted-placeholder", reconnectRequired: true })] : [],
      deviceReadings: [reading("protected", 100)],
    });
    await store.start(); await store.drain();
    expect(store.deleted).toEqual([]);
    expect(store.tables.dataRetentionSettings[0].lastCleanup).toBeUndefined();
  });

  it("uses the Drive checkpoint while preserving retention-boundary and unarchived readings", async () => {
    const watermark = now - day;
    const store = makeStore({
      dataRetentionSettings: [{ ...policy(), backupEnabled: true, backupDestination: "googleDrive", lastCompleteBackupAt: now, lastDriveBackupAt: watermark }],
      googleDriveConnections: [document("grant", { userId: "owner", encryptedRefreshToken: "encrypted-placeholder" })],
      deviceReadings: [reading("expired-archived", 100), { ...reading("expired-new", 100), _creationTime: watermark + 1 }, reading("boundary", 90), reading("recent", 1)],
    });
    await store.start(); await store.drain();
    expect(store.deleted).toEqual(["expired-archived"]);
    expect(store.tables.deviceReadings.map(row => row._id)).toEqual(["expired-new", "boundary", "recent"]);
  });
});
