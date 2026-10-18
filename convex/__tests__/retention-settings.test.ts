import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "../auth";
import { updateDataRetention } from "../settings";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

function makeContext(existing: Record<string, unknown> | null = null, connection: Record<string, unknown> | null = null) {
  const first = vi.fn(async () => existing);
  return {
    db: {
      query: vi.fn((table: string) => ({ withIndex: vi.fn(() => ({ first: table === "googleDriveConnections" ? async () => connection : first })) })),
      patch: vi.fn(),
      insert: vi.fn(),
    },
    storage: { delete: vi.fn() },
  };
}

const update = (updateDataRetention as unknown as {
  _handler: (
    ctx: ReturnType<typeof makeContext>,
    args: { retentionPeriodDays?: number; autoCleanupEnabled?: boolean; backupEnabled?: boolean; collectionIntervalMinutes?: number; backupIntervalHours?: number; backupDestination?: "email" | "googleDrive" }
  ) => Promise<{ success: boolean }>;
})._handler;

beforeEach(() => {
  vi.mocked(auth.getUserId).mockResolvedValue("owner" as Awaited<ReturnType<typeof auth.getUserId>>);
});

afterEach(() => { vi.restoreAllMocks(); });

describe("retention settings validation", () => {
  it("requires a connected owned Drive grant before selecting that destination", async () => {
    const ctx = makeContext({ _id: "settings" });
    await expect(update(ctx, { backupDestination: "googleDrive" })).rejects.toThrow("Connect Google Drive");
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });

  it("cancels only pending backup work when changing destination and preserves saved policy", async () => {
    const ctx = makeContext({ _id: "settings", retentionPeriodDays: 90, backupEnabled: true, backupIntervalHours: 336, backupRun: { preparedStorageId: "prepared-part" } }, { encryptedRefreshToken: "encrypted-placeholder" });
    await update(ctx, { backupDestination: "googleDrive" });
    expect(ctx.storage.delete).toHaveBeenCalledWith("prepared-part");
    expect(ctx.db.patch).toHaveBeenCalledWith("settings", expect.objectContaining({ backupDestination: "googleDrive", backupRun: undefined, retentionPeriodDays: 90, backupIntervalHours: 336, backupEnabled: true }));
  });

  it("lets a disconnected Drive owner disable backups without changing destination", async () => {
    const ctx = makeContext({ _id: "settings", backupDestination: "googleDrive" });
    await update(ctx, { backupEnabled: false });
    expect(ctx.db.patch).toHaveBeenCalledWith("settings", expect.objectContaining({ backupDestination: "googleDrive", backupEnabled: false }));
  });
  it.each([0, -1, 1.5, 1441, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid collection interval %s", async collectionIntervalMinutes => {
    const ctx = makeContext();
    await expect(update(ctx, { collectionIntervalMinutes })).rejects.toThrow("Collection interval");
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1, 1.5, 1000, Number.NaN])("rejects unsupported backup interval %s", async backupIntervalHours => {
    const ctx = makeContext();
    await expect(update(ctx, { backupIntervalHours })).rejects.toThrow("Backup interval");
    expect(ctx.db.query).not.toHaveBeenCalled();
  });

  it.each([24, 168, 336, 720])("persists the supported %s-hour backup interval", async backupIntervalHours => {
    const ctx = makeContext();
    await update(ctx, { backupIntervalHours });
    expect(ctx.db.insert).toHaveBeenCalledWith("dataRetentionSettings", expect.objectContaining({ backupIntervalHours }));
  });

  it("cancels prepared backup work when the owner disables backups", async () => {
    const ctx = makeContext({ _id: "settings", retentionPeriodDays: 90, backupRun: { preparedStorageId: "prepared-part" } });
    await update(ctx, { backupEnabled: false });
    expect(ctx.storage.delete).toHaveBeenCalledExactlyOnceWith("prepared-part");
    expect(ctx.db.patch).toHaveBeenCalledWith("settings", expect.objectContaining({ backupEnabled: false, backupRun: undefined }));
  });
  it.each([0, -1, 731, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid retention %s before accessing storage",
    async (retentionPeriodDays) => {
      const ctx = makeContext();
      await expect(update(ctx, { retentionPeriodDays })).rejects.toThrow("Retention period");
      expect(ctx.db.query).not.toHaveBeenCalled();
      expect(ctx.db.patch).not.toHaveBeenCalled();
      expect(ctx.db.insert).not.toHaveBeenCalled();
    }
  );

  it.each([1, 30, 90, 365, 730])("saves the selected %s-day retention exactly", async (retentionPeriodDays) => {
    const ctx = makeContext({ _id: "settings", retentionPeriodDays: 90 });
    expect(await update(ctx, { retentionPeriodDays })).toEqual({ success: true });
    expect(ctx.db.patch).toHaveBeenCalledWith("settings", expect.objectContaining({ retentionPeriodDays }));
    expect(ctx.db.insert).not.toHaveBeenCalled();
  });

  it("keeps the selected retention when toggling automatic cleanup", async () => {
    const ctx = makeContext({ _id: "settings", retentionPeriodDays: 180 });
    await update(ctx, { autoCleanupEnabled: false });
    expect(ctx.db.patch).toHaveBeenCalledWith("settings", expect.objectContaining({
      retentionPeriodDays: 180, autoCleanupEnabled: false,
    }));
  });

  it("creates new owner settings with the selected retention", async () => {
    const ctx = makeContext();
    await update(ctx, { retentionPeriodDays: 30 });
    expect(ctx.db.insert).toHaveBeenCalledWith("dataRetentionSettings", expect.objectContaining({
      userId: "owner", retentionPeriodDays: 30,
    }));
  });

  it("checks authentication before validation or database access", async () => {
    vi.mocked(auth.getUserId).mockResolvedValue(null);
    const ctx = makeContext();
    await expect(update(ctx, { retentionPeriodDays: -1 })).rejects.toThrow("Unauthorized");
    expect(ctx.db.query).not.toHaveBeenCalled();
    expect(ctx.db.insert).not.toHaveBeenCalled();
    expect(ctx.db.patch).not.toHaveBeenCalled();
  });
});
