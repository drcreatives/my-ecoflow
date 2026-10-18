import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { checkAndRunBackups, continueBackupCheck, sendBackupPart, MAX_BACKUP_ATTACHMENT_BYTES } from "../backup";
import * as queries from "../backup_queries";
import * as drive from "../googleDriveApi";

vi.mock("../googleDriveApi", () => ({
  DriveError: class DriveError extends Error { constructor(message: string, readonly retryable = false) { super(message); } },
  getDriveAccess: vi.fn(), generateDriveId: vi.fn(), ensureDriveFolder: vi.fn(), ensureDriveFile: vi.fn(),
}));

const now = 1_800_000_000_000;
const day = 86_400_000;
type Row = { _id: string; _creationTime: number; [field: string]: unknown };
type Args = Record<string, unknown>;
type Registered = { _handler: (ctx: unknown, args: Args) => Promise<unknown> };
type Reference = FunctionReference<"query" | "mutation" | "action", "internal">;
const invoke = (fn: unknown, ctx: unknown, args: Args = {}) => (fn as Registered)._handler(ctx, args);
const row = (id: string, values: Args = {}): Row => ({ _id: id, _creationTime: 1, ...values });
const reading = (id: string, ageDays: number, values: Args = {}) => row(id, {
  _creationTime: now - ageDays * day, deviceId: "device", recordedAt: now - ageDays * day, batteryLevel: 0, acEnabled: false, ...values,
});

function setup(options: { readings?: Row[]; settings?: Args; devices?: Row[]; notifications?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    users: [row("owner", { email: "owner@example.test", firstName: "<Owner>", privateField: "never-export" })],
    devices: options.devices ?? [row("device", { userId: "owner", deviceSn: "TEST-DEVICE", deviceName: "Device", deviceType: "DELTA_2", isActive: true, mqttLeases: { secret: "never-export" } })],
    dataRetentionSettings: [row("settings", {
      userId: "owner", retentionPeriodDays: 90, backupEnabled: true, autoCleanupEnabled: true,
      collectionIntervalMinutes: 1, backupIntervalHours: 24, ...options.settings,
    })],
    notificationSettings: options.notifications ?? [], deviceReadings: options.readings ?? [], notificationLogs: [],
  };
  const files = new Map<string, Blob>();
  const queue: Array<{ reference: Reference; args: Args }> = [];
  const requests: Array<{ table: string; opts: Args }> = [];
  let fileId = 0;
  const db = {
    get: vi.fn(async (id: string) => Object.values(tables).flat().find((entry) => entry._id === id) ?? null),
    query: vi.fn((table: string) => {
      const filters: Array<(entry: Row) => boolean> = [];
      const range = {
        eq(field: string, value: unknown) { filters.push((entry) => entry[field] === value); return range; },
        gte(field: string, value: number) { filters.push((entry) => (entry[field] as number) >= value); return range; },
        lte(field: string, value: number) { filters.push((entry) => (entry[field] as number) <= value); return range; },
      };
      const entries = () => tables[table].filter((entry) => filters.every((filter) => filter(entry)))
        .sort((a, b) => String(a._id).localeCompare(String(b._id)));
      const builder = {
        withIndex: (_name: string, configure: (q: typeof range) => unknown) => { configure(range); return builder; },
        first: async () => entries()[0] ?? null,
        collect: () => { throw new Error("Unbounded backup read"); },
        paginate: async (opts: Args) => {
          requests.push({ table, opts });
          const candidates = entries().filter((entry) => opts.cursor === null || entry._id > (opts.cursor as string));
          const page: Row[] = [];
          let bytes = 0;
          for (const entry of candidates) {
            if (page.length >= (opts.numItems as number) || page.length >= (opts.maximumRowsRead as number) || bytes >= (opts.maximumBytesRead as number)) break;
            page.push(entry);
            bytes += JSON.stringify(entry).length;
          }
          return { page, isDone: page.length === candidates.length, continueCursor: page.at(-1)?._id ?? opts.cursor };
        },
      };
      return builder;
    }),
    patch: vi.fn(async (id: string, values: Args) => { Object.assign(Object.values(tables).flat().find((entry) => entry._id === id)!, values); }),
    insert: vi.fn(async (table: string, values: Args) => { tables[table].push(row(`inserted-${tables[table].length}`, values)); }),
  };
  const storage = {
    store: vi.fn(async (blob: Blob) => { const id = `file-${++fileId}`; files.set(id, blob); return id; }),
    get: vi.fn(async (id: string) => files.get(id) ?? null),
    delete: vi.fn(async (id: string) => { files.delete(id); }),
  };
  const scheduler = { runAfter: vi.fn(async (_delay: number, reference: Reference, args: Args) => { queue.push({ reference, args }); return "scheduled"; }) };
  const ctx = {
    db, storage, scheduler,
    runQuery: vi.fn(async (reference: Reference, args: Args) => invoke(queries[getFunctionName(reference).split(":")[1] as keyof typeof queries], ctx, args)),
    runMutation: vi.fn(async (reference: Reference, args: Args) => {
      const snapshot = structuredClone(tables);
      const savedFiles = new Map(files);
      const savedQueue = queue.length;
      try {
        return await invoke(queries[getFunctionName(reference).split(":")[1] as keyof typeof queries], ctx, args);
      } catch (error) {
        Object.assign(tables, snapshot);
        files.clear(); for (const [id, blob] of savedFiles) files.set(id, blob);
        queue.length = savedQueue;
        throw error;
      }
    }),
  };
  const errors: unknown[] = [];
  const drain = async () => {
    let count = 0;
    while (queue.length) {
      if (++count > 100) throw new Error("Backup did not terminate");
      const work = queue.shift()!;
      try { await invoke(getFunctionName(work.reference) === "backup:sendBackupPart" ? sendBackupPart : continueBackupCheck, ctx, work.args); }
      catch (error) { errors.push(error); }
    }
  };
  return { tables, files, queue, requests, ctx, db, storage, scheduler, errors, drain,
    settings: () => tables.dataRetentionSettings[0],
    start: () => invoke(checkAndRunBackups, ctx),
  };
}

function messages() {
  return vi.mocked(fetch).mock.calls.map(([, options]) => JSON.parse(options!.body as string) as {
    to: string; html: string; text: string; subject: string; attachments: Array<{ content: string }>;
  });
}
function attachments() {
  return messages().map((message) => JSON.parse(Buffer.from(message.attachments[0].content, "base64").toString()) as {
    window: { start: string; end: string }; readings: Array<Record<string, unknown>>;
    settings: Record<string, unknown>; finalPart: boolean; part: number;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubEnv("DISABLE_CRONS", "false");
  vi.stubEnv("RESEND_API_KEY", "test-placeholder");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "accepted" }), { status: 200 })));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(drive.getDriveAccess).mockResolvedValue({ accessToken: "test-drive-token", connectionVersion: "connection-v1", rootFolderId: "private-root" });
  let driveId = 0;
  vi.mocked(drive.generateDriveId).mockImplementation(async () => `drive-id-${++driveId}`);
  vi.mocked(drive.ensureDriveFolder).mockImplementation(async ({ id }) => ({ id, webViewLink: `https://drive.google.com/drive/folders/${id}` }));
  vi.mocked(drive.ensureDriveFile).mockImplementation(async ({ id, bytes }) => ({ id, size: bytes.byteLength, md5Checksum: "verified", webViewLink: `https://drive.google.com/file/d/${id}/view` }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("complete resumable email backups", () => {
  it.each(["email", "googleDrive"])("preserves thermal observations in bounded %s archive pages without changing checkpoints or contacting providers", async backupDestination => {
    const observedAt = now - 60_000;
    const thermal = row("thermal-event", {
      _creationTime: now - 30_000, deviceId: "device", recordedAt: observedAt,
      readingKind: "temperature", temperatureMeasurement: "bms-generic-mqtt-v1", temperature: 39,
      rawData: { privateVendorPayload: "never-export" },
    });
    const store = setup({ settings: { backupDestination, lastCompleteBackupAt: now - day, lastDriveBackupAt: now - day }, readings: [reading("power-event", 0.5), thermal] });
    const before = structuredClone(store.tables);
    const result = await invoke(queries.getDeviceReadingsInRange, store.ctx, {
      userId: "owner", deviceId: "device", startTime: now - day, endTime: now, cursor: null,
    }) as { page: Array<Record<string, unknown>>; isDone: boolean; owned: boolean };
    expect(result).toMatchObject({ owned: true, isDone: true });
    expect(result.page).toHaveLength(2);
    expect(result.page[1]).toMatchObject({ readingKind: "temperature", temperatureMeasurement: "bms-generic-mqtt-v1", temperature: 39, recordedAt: observedAt });
    for (const field of ["batteryLevel", "inputWatts", "outputWatts", "acInputWatts", "dcInputWatts", "solarInputWatts", "powerMeasurement", "solarPanelMeasurement", "status"]) {
      expect(result.page[1][field]).toBeNull();
    }
    expect(JSON.stringify(result.page)).not.toMatch(/never-export|rawData|_id|_creationTime|deviceId|userId|mqttLeases/);
    expect(store.tables).toEqual(before);
    expect(store.ctx.db.patch).not.toHaveBeenCalled();
    expect(store.ctx.db.insert).not.toHaveBeenCalled();
    expect(store.ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(drive.getDriveAccess).not.toHaveBeenCalled();
    expect(drive.ensureDriveFile).not.toHaveBeenCalled();
  });

  it.each([24, 168, 336, 720])("covers the entire interval after the previous successful %s-hour backup", async (hours) => {
    const startTime = now - hours * 60 * 60 * 1000;
    const store = setup({ settings: { backupIntervalHours: hours, lastBackupAt: startTime, lastCompleteBackupAt: startTime }, readings: [
      reading("boundary", hours / 24), reading("inside", hours / 24 - 0.1), reading("before", hours / 24 + 0.1), reading("future", -1),
    ] });
    await store.start(); await store.drain();
    expect(attachments()).toHaveLength(1);
    expect(attachments()[0].window).toMatchObject({ start: new Date(startTime).toISOString(), end: new Date(now).toISOString() });
    expect(attachments()[0].readings).toHaveLength(2);
    expect(store.settings().lastBackupAt).toBe(now);
    expect(store.settings().backupRun).toBeUndefined();
    expect(store.files.size).toBe(0);
  });

  it("includes the complete initial backlog and every page without sampling", async () => {
    const readings = Array.from({ length: 263 }, (_, index) => reading(`r-${String(index).padStart(4, "0")}`, 89, { rawData: { password: "never-export" }, solarInputWatts: 0 }));
    const store = setup({ readings: [...readings, reading("too-old", 91)] });
    await store.start(); await store.drain();
    const output = attachments()[0];
    expect(output.window.start).toBe(new Date(0).toISOString());
    expect(output.readings).toHaveLength(264);
    expect(output.readings[0]).toMatchObject({ batteryLevel: 0, solarInputWatts: 0, acEnabled: false, temperature: null, inputMeasurement: null });
    expect(output.settings).toHaveProperty("dataRetention");
    expect(output.settings).toHaveProperty("notifications");
    expect(JSON.stringify(output)).not.toMatch(/never-export|rawData|mqttLeases|_id|userId/);
    expect(messages()[0].html).toContain("&lt;Owner&gt;");
    expect(messages()[0].html).toContain('lang="en" dir="ltr"');
    expect(messages()[0].text).toContain("final part");
    expect(store.requests.filter((request) => request.table === "deviceReadings")).toHaveLength(3);
    expect(store.requests.every(({ opts }) => (opts.maximumBytesRead as number) <= 2 * 1024 * 1024 && (opts.maximumRowsRead as number) <= 100)).toBe(true);
  });

  it("pages through large legacy payloads without putting raw data in attachments", async () => {
    const store = setup({ readings: Array.from({ length: 20 }, (_, index) => reading(`r-${String(index).padStart(4, "0")}`, 10, {
      rawData: { payload: "x".repeat(500_000) },
    })) });
    await store.start(); await store.drain();
    expect(attachments()[0].readings).toHaveLength(20);
    expect(JSON.stringify(attachments())).not.toContain("rawData");
    expect(store.requests.filter((request) => request.table === "deviceReadings").length).toBeGreaterThan(1);
  });

  it("continues bounded discovery for more than one settings page", async () => {
    const store = setup();
    store.tables.dataRetentionSettings = Array.from({ length: 26 }, (_, index) => row(`settings-${String(index).padStart(4, "0")}`, {
      userId: `owner-${index}`, backupEnabled: false,
    }));
    await store.start(); await store.drain();
    expect(store.requests.filter((request) => request.table === "dataRetentionSettings")).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps both devices' readings in separate parts and identifies only the final part as complete", async () => {
    const store = setup({ readings: [reading("first", 10), reading("second", 10, { deviceId: "second-device" })] });
    store.tables.devices.push(row("second-device", { ...store.tables.devices[0], _id: "second-device", deviceSn: "SECOND-TEST-DEVICE" }));
    await store.start(); await store.drain();
    expect(attachments().flatMap((part) => part.readings)).toHaveLength(2);
    expect(attachments().map((part) => part.finalPart)).toEqual([false, true]);
    expect(store.settings().lastBackupAt).toBe(now);
  });

  it("splits large archives into bounded numbered parts and advances only after the final send", async () => {
    const readings = Array.from({ length: 70 }, (_, index) => reading(`r-${String(index).padStart(4, "0")}`, 10, { status: "s".repeat(100_000) }));
    const store = setup({ readings });
    await store.start();
    expect(store.settings().lastBackupAt).toBeUndefined();
    await store.drain();
    const parts = attachments();
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((part) => part.readings)).toHaveLength(70);
    expect(parts.map((part) => part.part)).toEqual(parts.map((_, index) => index + 1));
    expect(parts.at(-1)?.finalPart).toBe(true);
    expect(messages().every((message) => Buffer.from(message.attachments[0].content, "base64").length <= MAX_BACKUP_ATTACHMENT_BYTES)).toBe(true);
    expect(store.settings().lastBackupAt).toBe(now);
  });

  it("preserves a failed part's exact bytes and idempotency key across a later retry", async () => {
    const store = setup({ readings: [reading("original", 20)] });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 400 }));
    await store.start(); await store.drain();
    expect(store.settings().lastBackupAt).toBeUndefined();
    expect(store.files.size).toBe(1);
    expect(store.errors).toHaveLength(1);
    const firstBody = vi.mocked(fetch).mock.calls[0][1]!.body;
    const firstHeaders = vi.mocked(fetch).mock.calls[0][1]!.headers;
    store.tables.deviceReadings[0].batteryLevel = 99;
    store.tables.users[0].firstName = "Changed";
    await invoke(queries.claimBackup, store.ctx, { userId: "owner", now });
    await store.drain();
    expect(vi.mocked(fetch).mock.calls[1][1]!.body).toBe(firstBody);
    expect(vi.mocked(fetch).mock.calls[1][1]!.headers).toEqual(firstHeaders);
    expect(store.settings().lastBackupAt).toBe(now);
    expect(store.files.size).toBe(0);
  });

  it("keeps the previous checkpoint when a later multipart message fails", async () => {
    const store = setup({ settings: { lastBackupAt: now - 30 * day, lastCompleteBackupAt: now - 30 * day }, readings: Array.from({ length: 70 }, (_, index) => reading(`r-${String(index).padStart(4, "0")}`, 20, { status: "s".repeat(100_000) })) });
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{"id":"first"}', { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await store.start(); await store.drain();
    expect(store.settings().lastBackupAt).toBe(now - 30 * day);
    expect(store.settings().backupRun).toMatchObject({ part: 2, leaseUntil: 0 });
    expect(store.files.size).toBe(1);
  });

  it("removes an unadopted prepared file when persisting the part fails", async () => {
    const store = setup({ readings: [reading("row", 10)] });
    await store.start();
    store.ctx.runMutation.mockRejectedValueOnce(new Error("prepare failed"));
    const work = store.queue.shift()!;
    await expect(invoke(sendBackupPart, store.ctx, work.args)).rejects.toThrow("checkpoint was preserved");
    expect(store.files.size).toBe(0);
    expect(store.settings().lastBackupAt).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retries transient provider failures at most three times without advancing", async () => {
    const store = setup({ readings: [reading("row", 10)] });
    vi.mocked(fetch).mockImplementation(async () => new Response("{}", { status: 429 }));
    await store.start(); await store.drain();
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(new Set(vi.mocked(fetch).mock.calls.map(([, options]) => options!.body)).size).toBe(1);
    expect(store.settings().lastBackupAt).toBeUndefined();
    expect(store.tables.notificationLogs).toHaveLength(1);
    expect(store.queue).toHaveLength(0);
  });

  it("does not send disabled backups or overlapping hourly runs", async () => {
    const store = setup({ readings: [reading("row", 10)] });
    await store.start(); await store.start();
    expect(store.queue).toHaveLength(1);
    store.settings().backupEnabled = false;
    await store.drain();
    expect(fetch).not.toHaveBeenCalled();
    await store.start();
    expect(store.settings().backupRun).toBeUndefined();
    vi.stubEnv("DISABLE_CRONS", "true");
    await store.start();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not send data after device ownership changes during preparation", async () => {
    const store = setup({ readings: [reading("row", 10)] });
    store.storage.store.mockImplementationOnce(async (blob) => {
      store.files.set("changed-file", blob);
      store.tables.devices[0].userId = "another-owner";
      return "changed-file";
    });
    await store.start(); await store.drain();
    expect(fetch).not.toHaveBeenCalled();
    expect(store.settings().lastBackupAt).toBeUndefined();
    expect(store.settings().backupRun).toBeUndefined();
    expect(store.files.size).toBe(0);
    store.tables.devices[0].userId = "owner";
    await store.start(); await store.drain();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.settings().lastBackupAt).toBe(now);
  });

  it("honors a not-yet-due interval and retains old rows since the last success even beyond retention", async () => {
    const due = setup({ settings: { retentionPeriodDays: 30, lastBackupAt: now - 120 * day, lastCompleteBackupAt: now - 120 * day }, readings: [reading("old-but-unbacked", 100)] });
    await due.start(); await due.drain();
    expect(attachments()[0].readings).toHaveLength(1);
    vi.mocked(fetch).mockClear();
    const early = setup({ settings: { backupIntervalHours: 720, lastBackupAt: now - 29 * day, lastCompleteBackupAt: now - 29 * day } });
    await early.start(); await early.drain();
    expect(fetch).not.toHaveBeenCalled();
    expect(early.settings().backupRun).toBeUndefined();
  });

  it("does not trust a legacy seven-day backup timestamp for the first complete archive", async () => {
    const store = setup({ settings: { lastBackupAt: now - day, backupIntervalHours: 720 }, readings: [reading("legacy-backlog", 150)] });
    await store.start(); await store.drain();
    expect(attachments()[0].window.start).toBe(new Date(0).toISOString());
    expect(attachments()[0].readings).toHaveLength(1);
    expect(store.settings().lastCompleteBackupAt).toBe(now);
  });

  it("includes delayed old measurements stored after the previous complete archive", async () => {
    const store = setup({ settings: { lastBackupAt: now - day, lastCompleteBackupAt: now - day }, readings: [
      reading("late-backfill", 200, { _creationTime: now - 60_000 }), reading("already-archived", 2),
    ] });
    await store.start(); await store.drain();
    expect(attachments()[0].readings).toHaveLength(1);
    expect(attachments()[0].readings[0].recordedAt).toBe(new Date(now - 200 * day).toISOString());
    expect(store.settings().lastCompleteBackupAt).toBe(now);
  });
});

describe("private Google Drive archives with one link email", () => {
  it("uploads every numbered part and a bounded manifest before sending one link email", async () => {
    const readings = Array.from({ length: 70 }, (_, index) => reading(`r-${String(index).padStart(4, "0")}`, 10, { status: "s".repeat(100_000) }));
    const store = setup({ settings: { backupDestination: "googleDrive" }, readings });
    await store.start(); await store.drain();
    const uploads = vi.mocked(drive.ensureDriveFile).mock.calls.map(([value]) => value);
    const parts = uploads.filter((value) => value.name !== "manifest.json");
    const manifests = uploads.filter((value) => value.name === "manifest.json");
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((value) => JSON.parse(Buffer.from(value.bytes).toString()).readings)).toHaveLength(70);
    expect(parts.every((value) => value.bytes.byteLength <= MAX_BACKUP_ATTACHMENT_BYTES)).toBe(true);
    expect(manifests).toHaveLength(1);
    const manifest = JSON.parse(Buffer.from(manifests[0].bytes).toString());
    expect(manifest).toMatchObject({ format: "ecoflow-partitioned-json-v1", readingCount: 70, partCount: parts.length });
    expect(manifests[0].bytes.byteLength).toBeLessThan(4_000);
    expect(messages()).toHaveLength(1);
    expect(messages()[0].attachments).toEqual([]);
    expect(messages()[0].text).toContain("https://drive.google.com/drive/folders/drive-id-1");
    expect(store.settings()).toMatchObject({ lastDriveBackupAt: now, lastCompleteBackupAt: now, lastBackupAt: now });
    expect(store.settings().backupRun).toBeUndefined();
    expect(store.files.size).toBe(0);
  });

  it("starts a complete first Drive archive even after a recent successful email backup", async () => {
    const store = setup({ settings: { backupDestination: "googleDrive", lastCompleteBackupAt: now - 60_000, lastBackupAt: now - 60_000 }, readings: [reading("old", 200)] });
    await store.start(); await store.drain();
    const part = vi.mocked(drive.ensureDriveFile).mock.calls.find(([value]) => value.name !== "manifest.json")![0];
    const payload = JSON.parse(Buffer.from(part.bytes).toString());
    expect(payload.window.start).toBe(new Date(0).toISOString());
    expect(payload.readings).toHaveLength(1);
    expect(messages()).toHaveLength(1);
  });

  it("uses the last complete Drive archive watermark for subsequent scheduled archives", async () => {
    const store = setup({ settings: { backupDestination: "googleDrive", lastDriveBackupAt: now - 14 * day, backupIntervalHours: 336, lastCompleteBackupAt: now - day }, readings: [reading("new", 5), reading("old", 15)] });
    await store.start(); await store.drain();
    const part = vi.mocked(drive.ensureDriveFile).mock.calls.find(([value]) => value.name !== "manifest.json")![0];
    const payload = JSON.parse(Buffer.from(part.bytes).toString());
    expect(payload.window.start).toBe(new Date(now - 14 * day).toISOString());
    expect(payload.readings).toHaveLength(1);
  });

  it("preserves IDs and exact part bytes after an uncertain upload and sends no email until recovery", async () => {
    const store = setup({ settings: { backupDestination: "googleDrive" }, readings: [reading("original", 10)] });
    vi.mocked(drive.ensureDriveFile).mockRejectedValue(new Error("Upload response unknown"));
    await store.start(); await store.drain();
    expect(fetch).not.toHaveBeenCalled();
    expect(store.settings().lastCompleteBackupAt).toBeUndefined();
    const initial = vi.mocked(drive.ensureDriveFile).mock.calls[0][0];
    const idsBefore = vi.mocked(drive.generateDriveId).mock.calls.length;
    store.tables.deviceReadings[0].batteryLevel = 99;
    vi.mocked(drive.ensureDriveFile).mockImplementation(async ({ id, bytes }) => ({ id, size: bytes.byteLength, md5Checksum: "verified", webViewLink: `https://drive.google.com/file/d/${id}/view` }));
    await invoke(queries.claimBackup, store.ctx, { userId: "owner", now });
    await store.drain();
    const retried = vi.mocked(drive.ensureDriveFile).mock.calls.at(-2)![0];
    expect(retried.id).toBe(initial.id);
    expect(Buffer.from(retried.bytes)).toEqual(Buffer.from(initial.bytes));
    expect(vi.mocked(drive.generateDriveId).mock.calls.length).toBe(idsBefore);
    expect(messages()).toHaveLength(1);
    expect(store.settings().lastDriveBackupAt).toBe(now);
  });

  it("keeps cleanup blocked and sends no link when the final manifest cannot be verified", async () => {
    const store = setup({ settings: { backupDestination: "googleDrive" }, readings: [reading("original", 10)] });
    vi.mocked(drive.ensureDriveFile).mockImplementation(async ({ id, bytes, name }) => {
      if (name === "manifest.json") throw new Error("Checksum mismatch");
      return { id, size: bytes.byteLength, md5Checksum: "verified", webViewLink: `https://drive.google.com/file/d/${id}/view` };
    });
    await store.start(); await store.drain();
    expect(fetch).not.toHaveBeenCalled();
    expect(store.settings().lastCompleteBackupAt).toBeUndefined();
    expect(store.settings().lastDriveBackupAt).toBeUndefined();
    expect(store.settings().backupRun).toBeDefined();
  });

  it("reuses a verified archive on a link-email retry without advancing before Resend accepts", async () => {
    const store = setup({ settings: { backupDestination: "googleDrive" }, readings: [reading("original", 10)] });
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 422 }));
    await store.start(); await store.drain();
    expect(store.settings().lastDriveBackupAt).toBeUndefined();
    const first = vi.mocked(fetch).mock.calls[0][1];
    await invoke(queries.claimBackup, store.ctx, { userId: "owner", now }); await store.drain();
    expect(vi.mocked(fetch).mock.calls[1][1]!.body).toBe(first!.body);
    expect(vi.mocked(fetch).mock.calls[1][1]!.headers).toEqual(first!.headers);
    expect(store.settings().lastDriveBackupAt).toBe(now);
  });

  it("does not upload or send after backups are disabled while obtaining Drive access", async () => {
    const store = setup({ settings: { backupDestination: "googleDrive" }, readings: [reading("original", 10)] });
    vi.mocked(drive.getDriveAccess).mockImplementation(async () => {
      store.settings().backupEnabled = false;
      return { accessToken: "test-drive-token", connectionVersion: "connection-v1", rootFolderId: "private-root" };
    });
    await store.start(); await store.drain();
    expect(drive.ensureDriveFolder).not.toHaveBeenCalled();
    expect(drive.ensureDriveFile).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(store.settings().lastCompleteBackupAt).toBeUndefined();
  });

  it("cancels without uploading readings when device ownership changes after folder preparation", async () => {
    const store = setup({ settings: { backupDestination: "googleDrive" }, readings: [reading("original", 10)] });
    vi.mocked(drive.ensureDriveFolder).mockImplementation(async ({ id }) => {
      store.tables.devices[0].userId = "another-owner";
      return { id, webViewLink: `https://drive.google.com/drive/folders/${id}` };
    });
    await store.start(); await store.drain();
    expect(drive.ensureDriveFile).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(store.settings().backupRun).toBeUndefined();
    expect(store.settings().lastDriveBackupAt).toBeUndefined();
  });

  it("does not send a completion link or authorize cleanup after Drive access is revoked", async () => {
    const store = setup({ settings: { backupDestination: "googleDrive" }, readings: [reading("original", 10)] });
    vi.mocked(drive.getDriveAccess).mockResolvedValueOnce({ accessToken: "test-drive-token", connectionVersion: "connection-v1", rootFolderId: "private-root" })
      .mockResolvedValueOnce({ accessToken: "test-drive-token", connectionVersion: "connection-v1", rootFolderId: "private-root" })
      .mockRejectedValue(new Error("Connection revoked"));
    await store.start(); await store.drain();
    expect(drive.ensureDriveFile).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(store.settings().lastDriveBackupAt).toBeUndefined();
    expect(store.settings().lastCompleteBackupAt).toBeUndefined();
  });

  it("keeps the saved cadence after a successful Drive archive", async () => {
    const store = setup({ settings: { backupDestination: "googleDrive", lastDriveBackupAt: now - 13 * day, backupIntervalHours: 336 }, readings: [reading("original", 10)] });
    await store.start(); await store.drain();
    expect(drive.getDriveAccess).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(store.settings().backupRun).toBeUndefined();
  });
});
