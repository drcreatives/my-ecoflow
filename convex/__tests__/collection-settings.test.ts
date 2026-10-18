import { describe, expect, it, vi } from "vitest";
import type { QueryCtx } from "../_generated/server";
import { getCollectionSettingsForDevices } from "../settings";

const handler = (getCollectionSettingsForDevices as unknown as {
  _handler: (ctx: QueryCtx, args: Record<string, never>) => Promise<Array<{
    userId: string; collectionIntervalMinutes: number; lastCollectionAt: number | null;
  }>>;
})._handler;

describe("background collection eligibility", () => {
  it("includes device owners with default collection settings before they save the form", async () => {
    const first = vi.fn(async () => null);
    const settingsIndex = vi.fn(() => ({ first }));
    const deviceIndex = vi.fn(() => ({ collect: vi.fn(async () => [{ userId: "owner" }, { userId: "owner" }]) }));
    const query = vi.fn((table: string) => table === "devices" ? { withIndex: deviceIndex } : { withIndex: settingsIndex });
    const ctx = { db: { query } } as unknown as QueryCtx;
    expect(await handler(ctx, {})).toEqual([{ userId: "owner", collectionIntervalMinutes: 5, lastCollectionAt: null }]);
    expect(deviceIndex).toHaveBeenCalledWith("by_isActive", expect.any(Function));
    expect(settingsIndex).toHaveBeenCalledWith("by_userId", expect.any(Function));
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("keeps an owner's configured interval and last successful collection time", async () => {
    const query = vi.fn((table: string) => ({ withIndex: vi.fn(() => table === "devices"
      ? { collect: vi.fn(async () => [{ userId: "owner" }]) }
      : { first: vi.fn(async () => ({ collectionIntervalMinutes: 1, lastCollectionAt: 123_000 })) }) }));
    const ctx = { db: { query } } as unknown as QueryCtx;
    expect(await handler(ctx, {})).toEqual([{ userId: "owner", collectionIntervalMinutes: 1, lastCollectionAt: 123_000 }]);
  });
});
