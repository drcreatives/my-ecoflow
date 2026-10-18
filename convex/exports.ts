import { query } from "./_generated/server";
import { v } from "convex/values";
import { auth } from "./auth";
import { serializeReadingForExport } from "./readingExport";

/** Issue the server's cutoff once so a browser clock cannot skew an export. */
export const exportWindow = query({
  args: {},
  handler: async ctx => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const deletionRevision = user.readingDeletionRevision ?? 0;
    if (!Number.isSafeInteger(deletionRevision) || deletionRevision < 0) {
      throw new Error("Invalid reading deletion revision");
    }
    return { endTime: Date.now(), deletionRevision };
  },
});

// Exports deliberately paginate the full indexed range, independently of the
// chart's sampling budget. The browser fixes endTime once for the entire file.
export const readingPage = query({
  args: {
    deviceId: v.id("devices"),
    cursor: v.union(v.string(), v.null()),
    endTime: v.float64(),
    deletionRevision: v.float64(),
  },
  handler: async (ctx, args) => {
    const empty = { page: [], isDone: true, continueCursor: "", available: false };
    const userId = await auth.getUserId(ctx);
    if (!userId) return empty;
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) return empty;
    const user = await ctx.db.get(userId);
    if (!user) return empty;
    if (!Number.isSafeInteger(args.endTime) || args.endTime < 0 || args.endTime > Date.now()) {
      throw new Error("Invalid export end time");
    }
    const currentRevision = user.readingDeletionRevision ?? 0;
    if (!Number.isSafeInteger(args.deletionRevision) || args.deletionRevision < 0 ||
        !Number.isSafeInteger(currentRevision) || currentRevision < 0) {
      throw new Error("Invalid reading deletion revision");
    }
    if (args.deletionRevision !== currentRevision) {
      throw new Error("Reading export stopped because retention cleanup changed the stored readings. Please export again.");
    }
    if (args.cursor !== null && args.cursor.length === 0) {
      throw new Error("Invalid export cursor");
    }
    const page = await ctx.db.query("deviceReadings")
      .withIndex("by_deviceId", q =>
        q.eq("deviceId", args.deviceId).lte("_creationTime", args.endTime))
      .order("asc")
      .paginate({
        cursor: args.cursor, numItems: 100,
        maximumRowsRead: 100, maximumBytesRead: 512 * 1024,
      });
    return {
      page: page.page.map(reading => serializeReadingForExport(reading, device)),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      available: true,
    };
  },
});
