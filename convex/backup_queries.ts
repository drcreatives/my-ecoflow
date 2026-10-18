import { internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { serializeReadingForExport } from "./readingExport";
import { v } from "convex/values";
import { backupContextValidator, backupDeviceValidator, backupPaginationFields } from "./backupValidators";

const cursor = v.union(v.string(), v.null());
const PAGE_BYTES = 2 * 1024 * 1024;
const LEASE_MS = 15 * 60 * 1000;
const INTERVAL_HOURS = [24, 168, 336, 720];
export type BackupRun = NonNullable<Doc<"dataRetentionSettings">["backupRun"]>;

// ─── Bounded discovery and deliberate backup shapes ────────────────────────

export const listBackupSettingsPage = internalQuery({
  args: { cursor, endTime: v.float64() },
  returns: v.object({ ...backupPaginationFields, page: v.array(v.object({ userId: v.id("users") })) }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("dataRetentionSettings")
      .withIndex("by_creation_time", (q) => q.lte("_creationTime", args.endTime))
      .paginate({ cursor: args.cursor, numItems: 25, maximumRowsRead: 25, maximumBytesRead: PAGE_BYTES });
    return { ...page, page: page.page.map((settings) => ({ userId: settings.userId })) };
  },
});

export const getBackupContext = internalQuery({
  args: { userId: v.id("users"), token: v.string(), part: v.float64() },
  returns: backupContextValidator,
  handler: async (ctx, args) => {
    if (process.env.DISABLE_CRONS === "true") return null;
    const settings = await ctx.db.query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    const run = settings?.backupRun;
    if (!settings?.backupEnabled || !run || run.token !== args.token || run.part !== args.part) return null;
    const user = await ctx.db.get(args.userId);
    if (!user?.email) return null;
    const notifications = await ctx.db.query("notificationSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    return {
      run,
      user: { email: user.email, firstName: user.firstName ?? null, lastName: user.lastName ?? null },
      settings: {
        dataRetention: {
          retentionPeriodDays: settings.retentionPeriodDays,
          autoCleanupEnabled: settings.autoCleanupEnabled,
          backupEnabled: settings.backupEnabled,
          backupDestination: settings.backupDestination ?? "email",
          backupIntervalHours: settings.backupIntervalHours ?? 24,
          collectionIntervalMinutes: settings.collectionIntervalMinutes,
        },
        notifications: notifications ? {
          deviceAlerts: notifications.deviceAlerts, lowBattery: notifications.lowBattery,
          powerThreshold: notifications.powerThreshold, systemUpdates: notifications.systemUpdates,
          weeklyReports: notifications.weeklyReports, emailNotifications: notifications.emailNotifications,
          pushNotifications: notifications.pushNotifications, lowBatteryThreshold: notifications.lowBatteryThreshold,
          powerThresholdWatts: notifications.powerThresholdWatts,
        } : {
          deviceAlerts: true, lowBattery: true, powerThreshold: false, systemUpdates: true,
          weeklyReports: false, emailNotifications: true, pushNotifications: false,
          lowBatteryThreshold: 20, powerThresholdWatts: 1800,
        },
      },
    };
  },
});

export const getBackupDevicePage = internalQuery({
  args: { userId: v.id("users"), cursor, endTime: v.float64() },
  returns: v.object({ ...backupPaginationFields, page: v.array(v.object({
    ...backupDeviceValidator.fields, id: v.id("devices"),
  })) }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("devices")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId).lte("_creationTime", args.endTime))
      .paginate({ cursor: args.cursor, numItems: 1, maximumRowsRead: 1, maximumBytesRead: PAGE_BYTES });
    return { ...page, page: page.page.map((device) => ({
      id: device._id, deviceName: device.deviceName ?? "EcoFlow Device", deviceSn: device.deviceSn,
      deviceType: device.deviceType, isActive: device.isActive, dcInputSource: device.dcInputSource ?? "auto",
      registeredAt: new Date(device._creationTime).toISOString(),
    })) };
  },
});

export const getDeviceReadingsInRange = internalQuery({
  args: {
    userId: v.id("users"), deviceId: v.id("devices"), startTime: v.float64(), endTime: v.float64(), cursor,
  },
  returns: v.object({ ...backupPaginationFields, owned: v.boolean(),
    page: v.array(v.record(v.string(), v.union(v.float64(), v.string(), v.boolean(), v.null()))),
    device: v.union(backupDeviceValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== args.userId) return { owned: false as const, page: [], isDone: true, continueCursor: null, device: null };
    // Device labels are repeated in portable rows. Bound that repetition too,
    // even if legacy metadata contains unusually large strings.
    const labelBytes = new TextEncoder().encode(`${device.deviceName ?? "EcoFlow Device"}${device.deviceSn}`).byteLength;
    const pageRows = Math.max(1, Math.min(100, Math.floor(512 * 1024 / Math.max(1, labelBytes))));
    const page = await ctx.db.query("deviceReadings")
      // Back up newly stored records, including delayed captures/backfills with
      // an older recordedAt. Creation time is the durable archive watermark.
      .withIndex("by_deviceId", (q) => q.eq("deviceId", args.deviceId)
        .gte("_creationTime", args.startTime).lte("_creationTime", args.endTime))
      .paginate({ cursor: args.cursor, numItems: pageRows, maximumRowsRead: pageRows, maximumBytesRead: PAGE_BYTES });
    return {
      ...page,
      owned: true as const,
      // Large legacy rawData never crosses the query/action boundary.
      page: page.page.map((reading) => serializeReadingForExport(reading, device)),
      device: {
        deviceName: device.deviceName ?? "EcoFlow Device", deviceSn: device.deviceSn,
        deviceType: device.deviceType, isActive: device.isActive, dcInputSource: device.dcInputSource ?? "auto",
        registeredAt: new Date(device._creationTime).toISOString(),
      },
    };
  },
});

export const isBackupDeviceOwned = internalQuery({
  args: { userId: v.id("users"), deviceId: v.id("devices") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    return device?.userId === args.userId;
  },
});

// ─── Durable multipart state and provider retry checkpoints ────────────────

export const claimBackup = internalMutation({
  args: { userId: v.id("users"), now: v.float64() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    if (process.env.DISABLE_CRONS === "true") return false;
    const settings = await ctx.db.query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    if (!settings) return false;
    if (!settings.backupEnabled) {
      if (settings.backupRun?.preparedStorageId) await ctx.storage.delete(settings.backupRun.preparedStorageId);
      if (settings.backupRun) await ctx.db.patch(settings._id, { backupRun: undefined });
      return false;
    }
    const user = await ctx.db.get(args.userId);
    if (!user?.email || !Number.isSafeInteger(args.now) || args.now > Date.now()) return false;
    let run = settings.backupRun;
    if (run && run.leaseUntil > args.now) return false;
    if (!run) {
      const intervalHours = settings.backupIntervalHours ?? 24;
      const days = settings.retentionPeriodDays;
      const destination = settings.backupDestination ?? "email";
      // A prior email archive is not a Drive archive. The first Drive run
      // includes every currently stored row before becoming incremental.
      const lastBackupAt = destination === "googleDrive" ? settings.lastDriveBackupAt : settings.lastCompleteBackupAt;
      if (!INTERVAL_HOURS.includes(intervalHours) || !Number.isSafeInteger(days) || days < 1 ||
          (lastBackupAt !== undefined && (!Number.isSafeInteger(lastBackupAt) || lastBackupAt < 0))) return false;
      if (lastBackupAt !== undefined && args.now - lastBackupAt < intervalHours * 60 * 60 * 1000) return false;
      // The first archive must include the existing backlog before retention
      // can remove it; later archives resume at the completed watermark.
      const startTime = lastBackupAt ?? 0;
      if (!Number.isSafeInteger(startTime) || startTime >= args.now) return false;
      run = {
        token: `${args.now}-${Math.random().toString(36).slice(2)}`,
        startTime, endTime: args.now, part: 1, deviceCursor: null, readingCursor: null,
        leaseUntil: args.now + LEASE_MS, retryCount: 0,
        destination,
      };
    } else {
      run = { ...run, leaseUntil: args.now + LEASE_MS, retryCount: 0 };
    }
    await ctx.db.patch(settings._id, { backupRun: run });
    await ctx.scheduler.runAfter(0, internal.backup.sendBackupPart, {
      userId: args.userId, token: run.token, part: run.part,
    });
    return true;
  },
});

export const prepareBackupPart = internalMutation({
  args: { userId: v.id("users"), token: v.string(), part: v.float64(), storageId: v.id("_storage") },
  returns: v.union(v.id("_storage"), v.null()),
  handler: async (ctx, args) => {
    const settings = await ctx.db.query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    const run = settings?.backupRun;
    if (process.env.DISABLE_CRONS === "true" || !settings?.backupEnabled || !run ||
        run.token !== args.token || run.part !== args.part) return null;
    if (run.preparedStorageId) return run.preparedStorageId;
    await ctx.db.patch(settings._id, { backupRun: { ...run, preparedStorageId: args.storageId } });
    return args.storageId;
  },
});

// Allocate external IDs durably before creating anything in Drive. Concurrent
// retries adopt the first IDs and therefore cannot create duplicate archives.
export const reserveDriveIds = internalMutation({
  args: {
    userId: v.id("users"), token: v.string(), part: v.float64(), connectionVersion: v.string(),
    folderId: v.string(), partFileId: v.string(), manifestFileId: v.string(),
  },
  returns: v.union(v.null(), v.object({ folderId: v.string(), partFileId: v.string(), manifestFileId: v.string() })),
  handler: async (ctx, args) => {
    if (process.env.DISABLE_CRONS === "true") return null;
    const settings = await ctx.db.query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    const run = settings?.backupRun;
    if (!settings?.backupEnabled || !run || run.destination !== "googleDrive" ||
        run.token !== args.token || run.part !== args.part ||
        (run.driveConnectionVersion !== undefined && run.driveConnectionVersion !== args.connectionVersion)) return null;
    const next = { ...run, driveConnectionVersion: args.connectionVersion,
      driveFolderId: run.driveFolderId ?? args.folderId,
      drivePartFileId: run.drivePartFileId ?? args.partFileId,
      driveManifestFileId: run.driveManifestFileId ?? args.manifestFileId };
    await ctx.db.patch(settings._id, { backupRun: next });
    return { folderId: next.driveFolderId, partFileId: next.drivePartFileId, manifestFileId: next.driveManifestFileId };
  },
});

export const advanceBackupPart = internalMutation({
  args: {
    userId: v.id("users"), token: v.string(), part: v.float64(), storageId: v.id("_storage"), complete: v.boolean(),
    deviceCursor: cursor, deviceId: v.optional(v.id("devices")), nextDeviceCursor: v.optional(cursor), readingCursor: cursor,
    readingCount: v.optional(v.float64()), byteCount: v.optional(v.float64()), messageId: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    if (process.env.DISABLE_CRONS === "true") return false;
    const settings = await ctx.db.query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    const run = settings?.backupRun;
    if (!settings || !run || run.token !== args.token || run.part !== args.part || run.preparedStorageId !== args.storageId) return false;
    if (!settings.backupEnabled) {
      await ctx.storage.delete(args.storageId);
      await ctx.db.patch(settings._id, { backupRun: undefined });
      return false;
    }
    await ctx.storage.delete(args.storageId);
    if (args.complete) {
      await ctx.db.patch(settings._id, {
        lastBackupAt: Math.max(settings.lastBackupAt ?? 0, run.endTime),
        lastCompleteBackupAt: Math.max(settings.lastCompleteBackupAt ?? 0, run.endTime),
        ...(run.destination === "googleDrive" ? { lastDriveBackupAt: Math.max(settings.lastDriveBackupAt ?? 0, run.endTime) } : {}),
        backupRun: undefined,
      });
      if (args.messageId) await ctx.db.insert("notificationLogs", {
        userId: args.userId, type: "backup", status: "sent", messageId: args.messageId, sentAt: Date.now(),
      });
    } else {
      const next: BackupRun = {
        ...run, part: run.part + 1, retryCount: 0, leaseUntil: Date.now() + LEASE_MS,
        deviceCursor: args.deviceCursor, deviceId: args.deviceId, nextDeviceCursor: args.nextDeviceCursor,
        readingCursor: args.readingCursor, preparedStorageId: undefined,
        drivePartFileId: undefined,
        driveReadingCount: (run.driveReadingCount ?? 0) + (args.readingCount ?? 0),
        driveTotalBytes: (run.driveTotalBytes ?? 0) + (args.byteCount ?? 0),
      };
      await ctx.db.patch(settings._id, { backupRun: next });
      await ctx.scheduler.runAfter(0, internal.backup.sendBackupPart, {
        userId: args.userId, token: next.token, part: next.part,
      });
    }
    return true;
  },
});

export const recordBackupFailure = internalMutation({
  args: { userId: v.id("users"), token: v.string(), part: v.float64(), retryable: v.boolean(), reset: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const settings = await ctx.db.query("dataRetentionSettings")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    const run = settings?.backupRun;
    if (!settings || !run || run.token !== args.token || run.part !== args.part) return null;
    if (args.reset) {
      if (run.preparedStorageId) await ctx.storage.delete(run.preparedStorageId);
      await ctx.db.patch(settings._id, { backupRun: undefined });
      await ctx.db.insert("notificationLogs", {
        userId: args.userId, type: "backup", status: "failed", sentAt: Date.now(),
        errorMessage: "Device ownership changed during the archive; a later backup will restart without advancing the checkpoint.",
      });
      return null;
    }
    if (!settings.backupEnabled) {
      if (run.preparedStorageId) await ctx.storage.delete(run.preparedStorageId);
      await ctx.db.patch(settings._id, { backupRun: undefined });
      return null;
    }
    const retry = args.retryable && run.retryCount < 2 && process.env.DISABLE_CRONS !== "true";
    await ctx.db.patch(settings._id, { backupRun: {
      ...run, retryCount: run.retryCount + 1, leaseUntil: retry ? Date.now() + LEASE_MS : 0,
    } });
    if (retry) {
      await ctx.scheduler.runAfter(1000 * 2 ** run.retryCount, internal.backup.sendBackupPart, {
        userId: args.userId, token: run.token, part: run.part,
      });
    } else {
      await ctx.db.insert("notificationLogs", {
        userId: args.userId, type: "backup", status: "failed", sentAt: Date.now(),
        errorMessage: "Automatic backup failed; its checkpoint and prepared file were preserved for a later retry.",
      });
    }
    return null;
  },
});
