import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { driveConfigured } from "./googleDriveConfig";

const pendingReset = {
  oauthStateHash: undefined, oauthBrowserNonceHash: undefined, oauthEncryptedCodeVerifier: undefined,
  oauthExpiresAt: undefined, oauthStatus: undefined, oauthClaimToken: undefined, oauthEncryptedRefreshToken: undefined,
  oauthReturnOrigin: undefined,
};

const connectionReturn = v.union(v.null(), v.object({
  version: v.string(), encryptedRefreshToken: v.union(v.string(), v.null()),
  folderId: v.union(v.string(), v.null()), reconnectRequired: v.boolean(),
}));

async function cancelBackupRun(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const settings = await ctx.db.query("dataRetentionSettings").withIndex("by_userId", (q) => q.eq("userId", userId)).first();
  if (!settings?.backupRun) return;
  const files = [settings.backupRun.preparedStorageId, settings.backupRun.driveManifestStorageId];
  for (const file of new Set(files)) if (file) await ctx.storage.delete(file);
  await ctx.db.patch(settings._id, { backupRun: undefined });
}

// ─── Public state never includes tokens, pending grants, or private IDs ────────
export const status = query({
  args: {},
  returns: v.union(v.null(), v.object({
    configured: v.boolean(), connected: v.boolean(), reconnectRequired: v.boolean(),
    connectedAt: v.union(v.float64(), v.null()), folderUrl: v.union(v.string(), v.null()),
  })),
  handler: async (ctx) => {
    const userId = await auth.getUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db.query("googleDriveConnections").withIndex("by_userId", (q) => q.eq("userId", userId)).first();
    return {
      configured: driveConfigured(), connected: Boolean(row?.encryptedRefreshToken && !row.reconnectRequired),
      reconnectRequired: row?.reconnectRequired ?? false, connectedAt: row?.connectedAt ?? null,
      folderUrl: row?.folderId ? `https://drive.google.com/drive/folders/${encodeURIComponent(row.folderId)}` : null,
    };
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx): Promise<{ success: true }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const row = await ctx.db.query("googleDriveConnections").withIndex("by_userId", (q) => q.eq("userId", userId)).first();
    // Deleting the entire row removes active and pending secrets immediately.
    // Google revocation can affect a newer grant for the same app/account, so
    // never queue a provider revocation that could race a later reconnect.
    if (row) await ctx.db.delete(row._id);
    // Destination and preferences remain unchanged. Missing Drive authorization
    // must hold cleanup instead of silently falling back to email attachments.
    await cancelBackupRun(ctx, userId);
    return { success: true };
  },
});

// ─── OAuth state is single use, owner bound, browser bound, and time limited ───
export const beginConnection = internalMutation({
  args: {
    userId: v.id("users"), stateHash: v.string(), browserNonceHash: v.string(), encryptedCodeVerifier: v.string(),
    expiresAt: v.float64(), initialVersion: v.string(), returnOrigin: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!await ctx.db.get(args.userId)) throw new Error("Unauthorized");
    const existing = await ctx.db.query("googleDriveConnections").withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    const now = Date.now();
    if (existing?.oauthStateHash && now - existing.updatedAt < 10_000) throw new Error("Wait a few seconds before reconnecting Google Drive.");
    const pending = {
      ...pendingReset, oauthStateHash: args.stateHash, oauthBrowserNonceHash: args.browserNonceHash,
      oauthEncryptedCodeVerifier: args.encryptedCodeVerifier, oauthExpiresAt: args.expiresAt,
      oauthStatus: "waiting" as const, oauthReturnOrigin: args.returnOrigin, updatedAt: now,
    };
    if (existing) await ctx.db.patch(existing._id, pending);
    else await ctx.db.insert("googleDriveConnections", { userId: args.userId, version: args.initialVersion, ...pending });
    return null;
  },
});

export const claimOAuthExchange = internalMutation({
  args: { stateHash: v.string(), claimToken: v.string() },
  returns: v.union(v.null(), v.object({ userId: v.id("users"), encryptedCodeVerifier: v.string(), returnOrigin: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleDriveConnections").withIndex("by_oauthStateHash", (q) => q.eq("oauthStateHash", args.stateHash)).first();
    if (!row || row.oauthStatus !== "waiting" || !row.oauthEncryptedCodeVerifier ||
        !row.oauthExpiresAt || row.oauthExpiresAt <= Date.now() || !await ctx.db.get(row.userId)) return null;
    await ctx.db.patch(row._id, { oauthStatus: "exchanging", oauthClaimToken: args.claimToken });
    return { userId: row.userId, encryptedCodeVerifier: row.oauthEncryptedCodeVerifier, returnOrigin: row.oauthReturnOrigin ?? null };
  },
});

export const savePendingGrant = internalMutation({
  args: { stateHash: v.string(), claimToken: v.string(), encryptedRefreshToken: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleDriveConnections").withIndex("by_oauthStateHash", (q) => q.eq("oauthStateHash", args.stateHash)).first();
    if (!row || row.oauthStatus !== "exchanging" || row.oauthClaimToken !== args.claimToken ||
        !row.oauthExpiresAt || row.oauthExpiresAt <= Date.now() || !await ctx.db.get(row.userId)) return false;
    await ctx.db.patch(row._id, {
      oauthStatus: "ready", oauthEncryptedRefreshToken: args.encryptedRefreshToken,
      oauthEncryptedCodeVerifier: undefined, oauthClaimToken: undefined,
    });
    return true;
  },
});

export const failOAuthExchange = internalMutation({
  args: { stateHash: v.string(), claimToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleDriveConnections").withIndex("by_oauthStateHash", (q) => q.eq("oauthStateHash", args.stateHash)).first();
    if (row?.oauthStatus === "exchanging" && row.oauthClaimToken === args.claimToken) await ctx.db.patch(row._id, pendingReset);
    return null;
  },
});

export const activateConnection = internalMutation({
  args: { userId: v.id("users"), stateHash: v.string(), browserNonceHash: v.string(), version: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleDriveConnections").withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    if (!row || row.oauthStateHash !== args.stateHash || row.oauthBrowserNonceHash !== args.browserNonceHash ||
        row.oauthStatus !== "ready" || !row.oauthEncryptedRefreshToken || !row.oauthExpiresAt ||
        row.oauthExpiresAt <= Date.now() || !await ctx.db.get(args.userId)) return false;
    await cancelBackupRun(ctx, args.userId);
    const now = Date.now();
    await ctx.db.patch(row._id, {
      ...pendingReset, version: args.version, encryptedRefreshToken: row.oauthEncryptedRefreshToken,
      folderId: undefined, connectedAt: now, updatedAt: now, reconnectRequired: false,
    });
    const settings = await ctx.db.query("dataRetentionSettings").withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    if (settings) await ctx.db.patch(settings._id, { backupDestination: "googleDrive", lastDriveBackupAt: undefined });
    else await ctx.db.insert("dataRetentionSettings", {
      userId: args.userId, retentionPeriodDays: 90, autoCleanupEnabled: true, backupEnabled: false,
      backupIntervalHours: 24, collectionIntervalMinutes: 5, backupDestination: "googleDrive",
    });
    return true;
  },
});

// ─── Internal upload credentials and compare-and-set connection changes ───────
export const getConnection = internalQuery({
  args: { userId: v.id("users") }, returns: connectionReturn,
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleDriveConnections").withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    if (!row) return null;
    return {
      version: row.version, encryptedRefreshToken: row.encryptedRefreshToken ?? null,
      folderId: row.folderId ?? null, reconnectRequired: row.reconnectRequired ?? false,
    };
  },
});

export const setFolderId = internalMutation({
  args: { userId: v.id("users"), version: v.string(), folderId: v.string() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(args.folderId)) throw new Error("Invalid Google Drive folder.");
    const row = await ctx.db.query("googleDriveConnections").withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    if (!row || row.version !== args.version || !row.encryptedRefreshToken || row.reconnectRequired) return false;
    if (row.folderId && row.folderId !== args.folderId) return false;
    await ctx.db.patch(row._id, { folderId: args.folderId, updatedAt: Date.now() });
    return true;
  },
});

export const markReconnectRequired = internalMutation({
  args: { userId: v.id("users"), version: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.query("googleDriveConnections").withIndex("by_userId", (q) => q.eq("userId", args.userId)).first();
    if (row?.version === args.version) await ctx.db.patch(row._id, { reconnectRequired: true, updatedAt: Date.now() });
    return null;
  },
});
