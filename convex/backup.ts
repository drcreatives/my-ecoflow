"use node";

import { createHash } from "node:crypto";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import type { BackupRun } from "./backup_queries";
import type { ReadingExport } from "./readingExport";
import { v } from "convex/values";
import { DriveError, getDriveAccess, generateDriveId, ensureDriveFolder, ensureDriveFile } from "./googleDriveApi";

const cursor = v.union(v.string(), v.null());
// Also fits Drive's small-file multipart upload budget without a whole archive
// ever being loaded into a single action.
export const MAX_BACKUP_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const MAX_PAGES_PER_PART = 100;
type Context = NonNullable<FunctionReturnType<typeof internal.backup_queries.getBackupContext>>;
type Position = Pick<BackupRun, "deviceCursor" | "deviceId" | "nextDeviceCursor" | "readingCursor">;
interface PreparedPart {
  message: {
    from: string; to: string; subject: string; html: string; text: string;
    attachments: Array<{ filename: string; content: string; content_type: string }>;
  };
  complete: boolean;
  next: Position;
  deviceId?: Id<"devices">;
}
class BackupError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly reset = false) { super(message); }
}

// ─── Hourly discovery and independently bounded delivery parts ─────────────

export const checkAndRunBackups = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => { await checkBackupSettingsPage(ctx, null, Date.now()); return null; },
});

export const continueBackupCheck = internalAction({
  args: { cursor, endTime: v.float64() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => { await checkBackupSettingsPage(ctx, args.cursor, args.endTime); return null; },
});

async function checkBackupSettingsPage(ctx: ActionCtx, pageCursor: string | null, endTime: number): Promise<void> {
    if (process.env.DISABLE_CRONS === "true" || !process.env.RESEND_API_KEY) return;
    const page = await ctx.runQuery(internal.backup_queries.listBackupSettingsPage, {
      cursor: pageCursor, endTime,
    });
    for (const settings of page.page) {
      await ctx.runMutation(internal.backup_queries.claimBackup, { userId: settings.userId, now: Date.now() });
    }
    if (!page.isDone) {
      if (page.continueCursor === pageCursor) throw new Error("Backup settings pagination made no progress");
      await ctx.scheduler.runAfter(0, internal.backup.continueBackupCheck, { cursor: page.continueCursor, endTime });
    }
}

export const sendBackupPart = internalAction({
  args: { userId: v.id("users"), token: v.string(), part: v.float64() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (process.env.DISABLE_CRONS === "true") return null;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return null;
    let storageId: Id<"_storage"> | undefined;
    try {
      let context = await ctx.runQuery(internal.backup_queries.getBackupContext, args);
      if (!context) return null;
      storageId = context.run.preparedStorageId;
      if (!storageId) {
        const prepared = await buildBackupPart(ctx, args.userId, context);
        const candidate = await ctx.storage.store(new Blob([JSON.stringify(prepared)], { type: "application/json" }));
        let saved: Id<"_storage"> | null;
        try {
          saved = await ctx.runMutation(internal.backup_queries.prepareBackupPart, { ...args, storageId: candidate });
        } catch (error) {
          // A failed mutation must not leak temporary files. If its response
          // was uncertain after commit, keep and reuse the adopted file.
          const current = await ctx.runQuery(internal.backup_queries.getBackupContext, args);
          if (current?.run.preparedStorageId === candidate) saved = candidate;
          else { await ctx.storage.delete(candidate); throw error; }
        }
        if (saved !== candidate) await ctx.storage.delete(candidate);
        if (!saved) return null;
        storageId = saved;
      }
      const blob = await ctx.storage.get(storageId);
      if (!blob) throw new BackupError("Prepared backup file is missing", false);
      const serialized = await blob.text();
      const prepared = JSON.parse(serialized) as PreparedPart;
      // Recheck after preparation and before any external effect.
      context = await ctx.runQuery(internal.backup_queries.getBackupContext, args);
      if (!context || context.run.preparedStorageId !== storageId) return null;
      if (context.user.email !== prepared.message.to) throw new BackupError("Backup recipient changed", false);
      if (prepared.deviceId && !await ctx.runQuery(internal.backup_queries.isBackupDeviceOwned, {
        userId: args.userId, deviceId: prepared.deviceId,
      })) throw new BackupError("Backup device ownership changed", false, true);
      let message = prepared.message;
      let readingCount: number | undefined;
      let byteCount: number | undefined;
      if (context.run.destination === "googleDrive") {
        const uploaded = await uploadDrivePart(ctx, args, context, prepared);
        if (!uploaded) return null;
        readingCount = uploaded.readingCount;
        byteCount = uploaded.byteCount;
        if (!prepared.complete) {
          await ctx.runMutation(internal.backup_queries.advanceBackupPart, {
            ...args, storageId, complete: false, ...prepared.next, readingCount, byteCount,
          });
          return null;
        }
        message = uploaded.message;
      }
      const digest = createHash("sha256").update(`${args.token}:${args.part}:${serialized}`).digest("hex");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `ecoflow-backup-${digest}` },
        body: JSON.stringify(message), signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new BackupError("Backup provider rejected a part", response.status === 429 || response.status >= 500);
      const accepted: unknown = await response.json();
      if (!accepted || typeof accepted !== "object" || !("id" in accepted) || typeof accepted.id !== "string" || !accepted.id) {
        throw new BackupError("Backup provider did not acknowledge a part", true);
      }
      await ctx.runMutation(internal.backup_queries.advanceBackupPart, {
        ...args, storageId, complete: prepared.complete, ...prepared.next, readingCount, byteCount, messageId: accepted.id,
      });
      return null;
    } catch (error) {
      await ctx.runMutation(internal.backup_queries.recordBackupFailure, {
        ...args, retryable: error instanceof BackupError || error instanceof DriveError ? error.retryable : true,
        reset: error instanceof BackupError && error.reset,
      });
      // Do not log recipient, attachment content, provider payloads, or credentials.
      console.error("Backup part failed; its checkpoint was preserved");
      throw new Error("Backup part failed; its checkpoint was preserved");
    }
  },
});

async function uploadDrivePart(
  ctx: ActionCtx, args: { userId: Id<"users">; token: string; part: number }, context: Context, prepared: PreparedPart,
): Promise<{ readingCount: number; byteCount: number; message: PreparedPart["message"] } | null> {
  const { run } = context;
  let access = await getDriveAccess(ctx, args.userId, run.driveConnectionVersion);
  const [folderId, partFileId, manifestFileId] = await Promise.all([
    run.driveFolderId ?? generateDriveId(access.accessToken),
    run.drivePartFileId ?? generateDriveId(access.accessToken),
    run.driveManifestFileId ?? generateDriveId(access.accessToken),
  ]);
  const ids = await ctx.runMutation(internal.backup_queries.reserveDriveIds, {
    ...args, connectionVersion: access.connectionVersion, folderId, partFileId, manifestFileId,
  });
  if (!ids) return null;
  const current = await ctx.runQuery(internal.backup_queries.getBackupContext, args);
  if (!current || current.run.preparedStorageId !== run.preparedStorageId ||
      current.user.email !== prepared.message.to) return null;
  const date = new Date(run.endTime).toISOString().slice(0, 10);
  await ensureDriveFolder({ accessToken: access.accessToken, id: ids.folderId,
    parentId: access.rootFolderId, name: `EcoFlow Backup ${date} ${run.token}` });
  // The exact prepared bytes survive retries, including a timeout after Google
  // accepted an upload. The helper verifies the fixed ID and checksums.
  const bytes = Buffer.from(prepared.message.attachments[0].content, "base64");
  const payload = JSON.parse(bytes.toString("utf8")) as {
    window: unknown; user: unknown; settings: unknown; readings: unknown[];
  };
  access = await getDriveAccess(ctx, args.userId, access.connectionVersion);
  if (prepared.deviceId && !await ctx.runQuery(internal.backup_queries.isBackupDeviceOwned, {
    userId: args.userId, deviceId: prepared.deviceId,
  })) throw new BackupError("Backup device ownership changed", false, true);
  await ensureDriveFile({ accessToken: access.accessToken, id: ids.partFileId, parentId: ids.folderId,
    name: `ecoflow-backup-${date}-part-${run.part}.json`, bytes, mimeType: "application/json",
    sha256: createHash("sha256").update(bytes).digest("hex") });
  const readingCount = payload.readings.length;
  const byteCount = bytes.byteLength;
  const folderUrl = `https://drive.google.com/drive/folders/${encodeURIComponent(ids.folderId)}`;
  if (!prepared.complete) return { readingCount, byteCount, message: prepared.message };
  const manifest = Buffer.from(JSON.stringify({
    format: "ecoflow-partitioned-json-v1", exportedAt: new Date(run.endTime).toISOString(),
    window: payload.window, user: payload.user, settings: payload.settings,
    partCount: run.part, readingCount: (run.driveReadingCount ?? 0) + readingCount,
    totalPartBytes: (run.driveTotalBytes ?? 0) + byteCount,
    partFilename: `ecoflow-backup-${date}-part-{part}.json`, firstPart: 1,
    instructions: "Keep this manifest and every numbered JSON part together. Each part preserves original measurement timestamps. Raw vendor payloads are excluded.",
  }));
  access = await getDriveAccess(ctx, args.userId, access.connectionVersion);
  await ensureDriveFile({ accessToken: access.accessToken, id: ids.manifestFileId, parentId: ids.folderId,
    name: "manifest.json", bytes: manifest, mimeType: "application/json",
    sha256: createHash("sha256").update(manifest).digest("hex") });
  // Do not send a link after a disconnect, disable, recipient change, or stale
  // scheduled invocation. The archive remains private in its owner's Drive.
  access = await getDriveAccess(ctx, args.userId, access.connectionVersion);
  const final = await ctx.runQuery(internal.backup_queries.getBackupContext, args);
  if (!final || final.run.preparedStorageId !== run.preparedStorageId || final.user.email !== prepared.message.to) return null;
  const count = (run.driveReadingCount ?? 0) + readingCount;
  const subject = `EcoFlow Data Backup – ${date}`;
  const text = `Your EcoFlow backup is ready in Google Drive (${count} readings).\n\n${folderUrl}\n\nThe private folder contains a manifest and ${run.part} numbered JSON parts. Keep all parts together. Raw vendor payloads are excluded.\n\nChange automatic backup preferences in your dashboard Settings.`;
  return { readingCount, byteCount, message: {
    from: prepared.message.from, to: prepared.message.to, subject, text,
    html: `<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222;background:#f4f4f4;padding:24px"><h1>${escapeHtml(subject)}</h1><p>Your backup of ${count} readings is ready.</p><p><a href="${escapeHtml(folderUrl)}">Open your private Google Drive backup</a></p><p>The folder contains a manifest and ${run.part} numbered JSON parts. Keep every part together. Raw vendor payloads are excluded.</p><p>Change automatic backup preferences in your dashboard Settings.</p></body></html>`,
    attachments: [],
  } };
}

// ─── Multipart JSON preparation ───────────────────────────────────────────

async function buildBackupPart(ctx: ActionCtx, userId: Id<"users">, context: Context): Promise<PreparedPart> {
  const { run } = context;
  const next: Position = {
    deviceCursor: run.deviceCursor, deviceId: run.deviceId,
    nextDeviceCursor: run.nextDeviceCursor, readingCursor: run.readingCursor,
  };
  if (!next.deviceId) {
    const page = await ctx.runQuery(internal.backup_queries.getBackupDevicePage, {
      userId, cursor: next.deviceCursor, endTime: run.endTime,
    });
    const device = page.page[0];
    if (!device) {
      if (!page.isDone) throw new BackupError("Backup device pagination made no progress", false);
      return prepareMessage(context, [], [], true, next);
    }
    next.deviceId = device.id;
    next.nextDeviceCursor = page.isDone ? null : page.continueCursor;
  }
  const readings: ReadingExport[] = [];
  const deviceId = next.deviceId;
  let readingBytes = 0;
  let device: NonNullable<FunctionReturnType<typeof internal.backup_queries.getDeviceReadingsInRange>["device"]> | undefined;
  let complete = false;
  for (let count = 0; count < MAX_PAGES_PER_PART; count++) {
    const page = await ctx.runQuery(internal.backup_queries.getDeviceReadingsInRange, {
      userId, deviceId: next.deviceId!, startTime: run.startTime, endTime: run.endTime, cursor: next.readingCursor,
    });
    if (!page.owned) throw new BackupError("Backup device ownership changed", false, true);
    device = page.device;
    const header = prepareMessage(context, [device], [], false, next);
    const headerBytes = Buffer.byteLength(header.message.attachments[0].content, "base64");
    const pageBytes = Buffer.byteLength(JSON.stringify(page.page.map((reading) => ({
      ...reading, recordedAt: new Date(reading.recordedAt).toISOString(),
    })))) - 2;
    const bytes = headerBytes + readingBytes + pageBytes + (readings.length && page.page.length ? 1 : 0);
    if (bytes > MAX_BACKUP_ATTACHMENT_BYTES) {
      if (readings.length === 0) throw new BackupError("One backup page exceeds the attachment budget", false);
      break; // Keep the preceding cursor: this entire page belongs to the next part.
    }
    readingBytes += pageBytes + (readings.length && page.page.length ? 1 : 0);
    readings.push(...page.page as ReadingExport[]);
    if (page.isDone) {
      complete = next.nextDeviceCursor === null;
      next.deviceCursor = next.nextDeviceCursor ?? null;
      next.deviceId = undefined;
      next.nextDeviceCursor = undefined;
      next.readingCursor = null;
      break;
    }
    if (page.continueCursor === next.readingCursor) throw new BackupError("Backup reading pagination made no progress", false);
    next.readingCursor = page.continueCursor;
  }
  return { ...prepareMessage(context, device ? [device] : [], readings, complete, next), deviceId };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function prepareMessage(context: Context, devices: unknown[], readings: ReadingExport[], complete: boolean, next: Position): PreparedPart {
  const { run, user, settings } = context;
  const date = new Date(run.endTime).toISOString().slice(0, 10);
  const payload = {
    exportedAt: new Date(run.endTime).toISOString(),
    window: { start: new Date(run.startTime).toISOString(), end: new Date(run.endTime).toISOString(), boundary: "inclusive", field: "_creationTime", meaning: "storedAt" },
    part: run.part, finalPart: complete, user, settings, devices,
    readings: readings.map((reading) => ({ ...reading, recordedAt: new Date(reading.recordedAt).toISOString() })),
  };
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json) > MAX_BACKUP_ATTACHMENT_BYTES) {
    throw new BackupError("Backup attachment exceeds the size budget", false);
  }
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "there";
  const title = `EcoFlow Data Backup – ${date} – Part ${run.part}${complete ? " (final)" : ""}`;
  const text = `Hi ${name},\n\nYour JSON backup part ${run.part} is attached (${readings.length} readings).\nRecords stored from ${payload.window.start} through ${payload.window.end}; original measurement times are preserved.\n${complete ? "This is the final part. All parts of this backup must be kept together." : "More numbered parts will follow. Keep every part together."}\n\nChange automatic email backup preferences in your dashboard Settings.`;
  return {
    complete, next,
    message: {
      from: "EcoFlow Dashboard <backup@devrunor.com>", to: user.email, subject: title, text,
      html: `<!DOCTYPE html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="font-family:Arial,sans-serif;line-height:1.6;color:#222;background:#f4f4f4;padding:24px"><div lang="en" dir="ltr" style="max-width:600px;margin:auto;background:#fff;padding:24px"><h1 style="font-size:24px">${escapeHtml(title)}</h1><p>Hi ${escapeHtml(name)},</p><p>Your JSON backup contains ${readings.length} readings in this part, together with your settings and device configuration.</p><p>${complete ? "This is the final part." : "More numbered parts will follow."} Keep all parts together for the complete backup.</p><p>Records stored from ${escapeHtml(payload.window.start)} through ${escapeHtml(payload.window.end)}. Original measurement times are preserved.</p><p>Change automatic email backup preferences in your dashboard Settings.</p></div></body></html>`,
      attachments: [{ filename: `ecoflow-backup-${date}-part-${run.part}.json`, content: Buffer.from(json).toString("base64"), content_type: "application/json" }],
    },
  };
}
