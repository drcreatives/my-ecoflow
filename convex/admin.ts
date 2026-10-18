import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { v, type Infer } from "convex/values";

// Match settings.getDataRetention for owners who have never saved settings.
// Persist these defaults only after a cleanup cycle succeeds.
const DEFAULT_SETTINGS = {
  retentionPeriodDays: 90,
  autoCleanupEnabled: true,
  backupEnabled: false,
  backupIntervalHours: 24,
  collectionIntervalMinutes: 5,
};
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_BYTES = 512 * 1024;
const DISCOVERY_PAGE_BYTES = 2 * 1024 * 1024;
const DELETE_PAGE_SIZE = 100;
const cursor = v.union(v.string(), v.null());
const ownerFields = {
  userId: v.id("users"),
  nextUserCursor: cursor,
  cutoffMs: v.float64(),
};
const deviceFields = {
  ...ownerFields,
  deviceId: v.id("devices"),
  nextDeviceCursor: cursor,
};
const cleanupState = v.union(
  v.object({ stage: v.literal("users"), cursor }),
  v.object({ stage: v.literal("devices"), ...ownerFields, cursor }),
  v.object({ stage: v.literal("readings"), ...deviceFields }),
  v.object({ stage: v.literal("alerts"), ...deviceFields }),
  v.object({ stage: v.literal("logs"), ...ownerFields }),
);
type CleanupState = Infer<typeof cleanupState>;
interface CleanupArgs { runStartedAt: number; state: CleanupState }
interface CleanupResult { totalDeleted: number; scheduled: boolean; skipped?: boolean }
const cleanupResult = v.object({ totalDeleted: v.float64(), scheduled: v.boolean(), skipped: v.optional(v.boolean()) });

// ─── Daily coordinator and bounded continuations ──────────────────────────

/** Start one bounded chain; totalDeleted describes this transaction only. */
export const cleanupOldReadings = internalMutation({
  args: {},
  returns: cleanupResult,
  handler: async (ctx): Promise<CleanupResult> => runCleanupBatch(ctx, {
    runStartedAt: Date.now(),
    state: { stage: "users", cursor: null },
  }),
});

export const continueCleanup = internalMutation({
  args: { runStartedAt: v.float64(), state: cleanupState },
  returns: cleanupResult,
  handler: async (ctx, args): Promise<CleanupResult> => runCleanupBatch(ctx, args),
});

// ─── Cleanup helpers ──────────────────────────────────────────────────────

async function runCleanupBatch(ctx: MutationCtx, args: CleanupArgs): Promise<CleanupResult> {
  // Recheck work queued before the deployment's cron guard was enabled.
  if (process.env.DISABLE_CRONS === "true") {
    return { totalDeleted: 0, scheduled: false, skipped: true };
  }
  if (!Number.isSafeInteger(args.runStartedAt) || args.runStartedAt > Date.now()) {
    throw new Error("Invalid cleanup start time");
  }
  const schedule = async (state: CleanupState): Promise<void> => {
    await ctx.scheduler.runAfter(0, internal.admin.continueCleanup, {
      runStartedAt: args.runStartedAt, state,
    });
  };
  const nextUser = async (nextUserCursor: string | null): Promise<boolean> => {
    if (nextUserCursor === null) return false;
    await schedule({ stage: "users", cursor: nextUserCursor });
    return true;
  };
  const state = args.state;

  if (state.stage === "users") {
    // Bound discovery as well as deletion. Capping creation time keeps a long
    // run from chasing owners and devices created after it began.
    const page = await ctx.db.query("users")
      .withIndex("by_creation_time", (q) => q.lte("_creationTime", args.runStartedAt))
      .paginate({ cursor: state.cursor, numItems: 1, maximumRowsRead: 1, maximumBytesRead: DISCOVERY_PAGE_BYTES });
    const owner = page.page[0];
    if (!owner) {
      if (!page.isDone) throw new Error("Cleanup owner pagination made no progress");
      return { totalDeleted: 0, scheduled: false };
    }
    await schedule({
      stage: "devices", userId: owner._id, cursor: null,
      nextUserCursor: page.isDone ? null : page.continueCursor,
      // Read the actual selected retention policy before any deletion.
      cutoffMs: args.runStartedAt,
    });
    return { totalDeleted: 0, scheduled: true };
  }

  const owner = await ctx.db.get(state.userId);
  const settings = await ctx.db.query("dataRetentionSettings")
    .withIndex("by_userId", (q) => q.eq("userId", state.userId)).first();
  const days = settings ? settings.retentionPeriodDays : DEFAULT_SETTINGS.retentionPeriodDays;
  const enabled = settings ? settings.autoCleanupEnabled : DEFAULT_SETTINGS.autoCleanupEnabled;
  const backupEnabled = settings ? settings.backupEnabled : DEFAULT_SETTINGS.backupEnabled;
  const driveBackup = backupEnabled && settings?.backupDestination === "googleDrive";
  const driveConnection = driveBackup ? await ctx.db.query("googleDriveConnections")
    .withIndex("by_userId", (q) => q.eq("userId", state.userId)).first() : null;
  const archivedThrough = backupEnabled ? (driveBackup ? settings?.lastDriveBackupAt : settings?.lastCompleteBackupAt) : undefined;
  const archiveUnavailable = backupEnabled && ((driveBackup && (!driveConnection?.encryptedRefreshToken || driveConnection.reconnectRequired)) || typeof archivedThrough !== "number" ||
    !Number.isSafeInteger(archivedThrough) || archivedThrough <= 0 || archivedThrough > Date.now());
  const selectedCutoff = args.runStartedAt - days * DAY_MS;
  // Let an active paginated backup finish reading before deleting its input.
  // Fail closed on corrupted legacy settings. A completed overlapping chain
  // also stops this one; before completion, overlapping deletes are idempotent
  // and serialized by Convex's optimistic concurrency control.
  if (!owner || enabled !== true || typeof backupEnabled !== "boolean" || archiveUnavailable ||
      settings?.backupRun !== undefined ||
      !Number.isSafeInteger(days) || days <= 0 ||
      !Number.isSafeInteger(selectedCutoff) || !Number.isSafeInteger(state.cutoffMs) ||
      (settings?.lastCleanup !== undefined && settings.lastCleanup >= args.runStartedAt)) {
    return { totalDeleted: 0, scheduled: await nextUser(state.nextUserCursor), skipped: true };
  }
  // Never advance this run's ceiling. Retention expansion narrows the remaining
  // deletes immediately; a shorter selected window takes full effect next run.
  // Legacy lastBackupAt may describe an incomplete seven-day export. Only the
  // watermark from a completed full archive can authorize backup-safe deletion.
  const cutoffMs = Math.min(state.cutoffMs, selectedCutoff,
    typeof archivedThrough === "number" ? archivedThrough : Number.POSITIVE_INFINITY);
  const ownerState = { userId: state.userId, nextUserCursor: state.nextUserCursor, cutoffMs };

  if (state.stage === "devices") {
    const page = await ctx.db.query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", state.userId).lte("_creationTime", args.runStartedAt))
      .paginate({ cursor: state.cursor, numItems: 1, maximumRowsRead: 1, maximumBytesRead: DISCOVERY_PAGE_BYTES });
    const device = page.page[0];
    if (!device) {
      if (!page.isDone) throw new Error("Cleanup device pagination made no progress");
      await schedule({ stage: "logs", ...ownerState });
    } else {
      await schedule({
        stage: "readings", ...ownerState, deviceId: device._id,
        nextDeviceCursor: page.isDone ? null : page.continueCursor,
      });
    }
    return { totalDeleted: 0, scheduled: true };
  }

  if (state.stage === "logs") {
    const expired = () => ctx.db.query("notificationLogs")
      .withIndex("by_userId_sentAt", (q) => q.eq("userId", state.userId).lt("sentAt", cutoffMs));
    const page = await expired().paginate(deletePageOptions());
    const rows = await ensureDeleteProgress(page, () => expired().first());
    for (const row of rows) await ctx.db.delete(row._id);
    if (!page.isDone) {
      await schedule({ stage: "logs", ...ownerState });
      return { totalDeleted: rows.length, scheduled: true };
    }
    // Stamp success only after all devices and all three tables are exhausted.
    if (settings) {
      await ctx.db.patch(settings._id, { lastCleanup: Date.now() });
    } else {
      await ctx.db.insert("dataRetentionSettings", {
        userId: state.userId, ...DEFAULT_SETTINGS, lastCleanup: Date.now(),
      });
    }
    return { totalDeleted: rows.length, scheduled: await nextUser(state.nextUserCursor) };
  }

  const nextDevice = async (): Promise<void> => {
    if (state.nextDeviceCursor === null) await schedule({ stage: "logs", ...ownerState });
    else await schedule({ stage: "devices", ...ownerState, cursor: state.nextDeviceCursor });
  };
  const device = await ctx.db.get(state.deviceId);
  // Ownership may have changed since discovery or the preceding batch.
  if (!device || device.userId !== state.userId) {
    await nextDevice();
    return { totalDeleted: 0, scheduled: true, skipped: true };
  }
  const deviceState = { ...ownerState, deviceId: state.deviceId, nextDeviceCursor: state.nextDeviceCursor };
  if (state.stage === "readings") {
    const expired = () => ctx.db.query("deviceReadings")
      .withIndex("by_deviceId_recordedAt", (q) => q.eq("deviceId", state.deviceId).lt("recordedAt", cutoffMs));
    const page = await expired().paginate(deletePageOptions());
    const rows = await ensureDeleteProgress(page, () => expired().first());
    const archivedRows = backupEnabled
      ? rows.filter((row) => typeof archivedThrough === "number" && row._creationTime <= archivedThrough)
      : rows;
    if (archivedRows.length > 0) {
      const revision = owner.readingDeletionRevision ?? 0;
      if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) {
        throw new Error("Invalid reading deletion revision");
      }
      // The owner read, deletes, and revision write share this mutation. A page
      // query can therefore see the old complete state or the changed revision,
      // never deleted readings with the preceding export revision.
      for (const row of archivedRows) await ctx.db.delete(row._id);
      await ctx.db.patch(owner._id, { readingDeletionRevision: revision + 1 });
    }
    if (archivedRows.length !== rows.length) {
      // A newly imported/backfilled row can have an old recordedAt while still
      // being absent from the archive. Defer this owner until a later backup;
      // rereading the same blocked oldest page would otherwise loop forever.
      return { totalDeleted: archivedRows.length, scheduled: await nextUser(state.nextUserCursor), skipped: true };
    }
    await schedule({ stage: page.isDone ? "alerts" : "readings", ...deviceState });
    return { totalDeleted: archivedRows.length, scheduled: true };
  }

  const expired = () => ctx.db.query("alerts")
    .withIndex("by_deviceId_createdAt", (q) => q.eq("deviceId", state.deviceId).lt("createdAt", cutoffMs));
  const page = await expired().paginate(deletePageOptions());
  const rows = await ensureDeleteProgress(page, () => expired().first());
  for (const row of rows) await ctx.db.delete(row._id);
  if (page.isDone) await nextDevice();
  else await schedule({ stage: "alerts", ...deviceState });
  return { totalDeleted: rows.length, scheduled: true };
}

function deletePageOptions() {
  // A page may overshoot the byte budget by one (at most 1 MiB) document.
  // Leave ample room for metadata and deletions within the transaction limits.
  return { cursor: null, numItems: DELETE_PAGE_SIZE, maximumRowsRead: DELETE_PAGE_SIZE, maximumBytesRead: PAGE_BYTES };
}

async function ensureDeleteProgress<T extends Doc<"deviceReadings"> | Doc<"alerts"> | Doc<"notificationLogs">>(
  page: { page: T[]; isDone: boolean }, first: () => Promise<T | null>,
): Promise<T[]> {
  if (page.page.length > 0 || page.isDone) return page.page;
  // An individual document can exceed the page's byte budget. Reading at most
  // that one document ensures progress instead of scheduling empty pages forever.
  // Restarting at cursor:null after deletion also preserves equal timestamps.
  const row = await first();
  if (!row) throw new Error("Cleanup deletion page made no progress");
  return [row];
}
