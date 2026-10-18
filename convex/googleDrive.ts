"use node";

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { driveConfigured, driveRedirectUri, driveReturnOrigin, GOOGLE_DRIVE_OAUTH_TTL_MS, GOOGLE_DRIVE_SCOPE } from "./googleDriveConfig";

const OPAQUE = /^[A-Za-z0-9_-]{43,128}$/;
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const MAX_PROVIDER_BODY = 64 * 1024;

function digest(value: string): string { return createHash("sha256").update(value).digest("base64url"); }
function encryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("Google Drive is not configured.");
  return Buffer.from(key, "hex");
}

/** Bind every encrypted secret to both its owner and its purpose. */
export function encryptDriveSecret(value: string, userId: string, purpose: "refresh" | "verifier"): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`ecoflow-drive:${userId}:${purpose}`));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptDriveSecret(value: string, userId: string, purpose: "refresh" | "verifier"): string {
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) {
    throw new Error("Google Drive authorization needs to be renewed.");
  }
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    if (iv.byteLength !== 12 || tag.byteLength !== 16) throw new Error("Invalid encrypted token");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(Buffer.from(`ecoflow-drive:${userId}:${purpose}`));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
  } catch { throw new Error("Google Drive authorization needs to be renewed."); }
}

interface TokenReply { access_token?: string; refresh_token?: string; scope?: string; error?: string }
async function requestToken(parameters: URLSearchParams): Promise<{ ok: boolean; reply: TokenReply }> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters, signal: AbortSignal.timeout(20_000), redirect: "error",
  });
  // Token endpoint errors must never escape as provider payloads or logs.
  if (Number(response.headers.get("content-length") ?? 0) > MAX_PROVIDER_BODY) throw new Error("Invalid authorization response");
  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_PROVIDER_BODY) throw new Error("Invalid authorization response");
  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid authorization response");
  return { ok: response.ok, reply: parsed as TokenReply };
}

// ─── Authenticated connection flow ───────────────────────────────────────────
export const startConnection = action({
  args: { browserNonce: v.string(), returnOrigin: v.optional(v.string()) },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    if (!OPAQUE.test(args.browserNonce)) throw new Error("Please restart Google Drive connection from Settings.");
    if (!driveConfigured()) throw new Error("Google Drive is not configured. Set up the server OAuth credentials first.");
    const returnOrigin = driveReturnOrigin(args.returnOrigin);
    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(48).toString("base64url");
    await ctx.runMutation(internal.googleDrive_queries.beginConnection, {
      userId, stateHash: digest(state), browserNonceHash: digest(args.browserNonce),
      encryptedCodeVerifier: encryptDriveSecret(codeVerifier, userId, "verifier"),
      expiresAt: Date.now() + GOOGLE_DRIVE_OAUTH_TTL_MS, initialVersion: randomUUID(), returnOrigin,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!, redirect_uri: driveRedirectUri(), response_type: "code",
      scope: GOOGLE_DRIVE_SCOPE, access_type: "offline", prompt: "consent select_account", state,
      code_challenge: digest(codeVerifier), code_challenge_method: "S256",
    }).toString();
    return { url: url.toString() };
  },
});

export const finishConnection = action({
  args: { state: v.string(), browserNonce: v.string() },
  returns: v.object({ success: v.literal(true) }),
  handler: async (ctx, args): Promise<{ success: true }> => {
    const userId = await auth.getUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    if (!driveConfigured()) throw new Error("Google Drive is not configured.");
    if (!OPAQUE.test(args.state) || !OPAQUE.test(args.browserNonce)) throw new Error("Google Drive connection expired. Connect again from Settings.");
    const activated: boolean = await ctx.runMutation(internal.googleDrive_queries.activateConnection, {
      userId, stateHash: digest(args.state), browserNonceHash: digest(args.browserNonce), version: randomUUID(),
    });
    if (!activated) throw new Error("Google Drive connection expired or belongs to another session. Connect again from Settings.");
    return { success: true };
  },
});

// ─── OAuth callback: state grants only pending credentials, never activation ──
export const handleOAuthCallback = internalAction({
  args: { state: v.string(), code: v.union(v.string(), v.null()), denied: v.boolean() },
  returns: v.object({ ready: v.boolean(), returnOrigin: v.union(v.string(), v.null()) }),
  handler: async (ctx, args): Promise<{ ready: boolean; returnOrigin: string | null }> => {
    if (!OPAQUE.test(args.state) || !driveConfigured()) return { ready: false, returnOrigin: null };
    const stateHash = digest(args.state);
    const claimToken = randomUUID();
    const claim: { userId: Id<"users">; encryptedCodeVerifier: string; returnOrigin: string | null } | null =
      await ctx.runMutation(internal.googleDrive_queries.claimOAuthExchange, { stateHash, claimToken });
    if (!claim) return { ready: false, returnOrigin: null };
    try {
      if (args.denied || !args.code || args.code.length > 8192) throw new Error("Authorization declined");
      const verifier = decryptDriveSecret(claim.encryptedCodeVerifier, claim.userId, "verifier");
      const result = await requestToken(new URLSearchParams({
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!, client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
        redirect_uri: driveRedirectUri(), grant_type: "authorization_code", code: args.code, code_verifier: verifier,
      }));
      const token = result.reply.refresh_token;
      if (!result.ok || typeof token !== "string" || !token || token.length > 8192 ||
          typeof result.reply.scope !== "string" || !result.reply.scope.split(" ").includes(GOOGLE_DRIVE_SCOPE)) {
        throw new Error("Drive offline permission was not granted");
      }
      const ready: boolean = await ctx.runMutation(internal.googleDrive_queries.savePendingGrant, {
        stateHash, claimToken, encryptedRefreshToken: encryptDriveSecret(token, claim.userId, "refresh"),
      });
      return { ready, returnOrigin: claim.returnOrigin };
    } catch {
      await ctx.runMutation(internal.googleDrive_queries.failOAuthExchange, { stateHash, claimToken });
      return { ready: false, returnOrigin: claim.returnOrigin };
    }
  },
});

export interface AuthorizedDriveCredentials { accessToken: string; connectionVersion: string; folderId?: string }

/** Used only by trusted Node backup actions. No bearer token reaches the UI. */
export async function getAuthorizedDriveCredentials(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">, userId: Id<"users">, expectedVersion?: string,
): Promise<AuthorizedDriveCredentials> {
  if (!driveConfigured()) throw new Error("Google Drive is not configured.");
  const connection: { version: string; encryptedRefreshToken: string | null; folderId: string | null; reconnectRequired: boolean } | null =
    await ctx.runQuery(internal.googleDrive_queries.getConnection, { userId });
  if (!connection?.encryptedRefreshToken || connection.reconnectRequired) throw new Error("Connect Google Drive again in Settings before backing up.");
  if (expectedVersion && connection.version !== expectedVersion) throw new Error("Google Drive connection changed. Restart the backup.");
  let refresh: string;
  try { refresh = decryptDriveSecret(connection.encryptedRefreshToken, userId, "refresh"); }
  catch {
    await ctx.runMutation(internal.googleDrive_queries.markReconnectRequired, { userId, version: connection.version });
    throw new Error("Connect Google Drive again in Settings before backing up.");
  }
  try {
    const result = await requestToken(new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID!, client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
      grant_type: "refresh_token", refresh_token: refresh,
    }));
    if (result.reply.error === "invalid_grant") {
      await ctx.runMutation(internal.googleDrive_queries.markReconnectRequired, { userId, version: connection.version });
      throw new Error("Drive grant expired");
    }
    const accessToken = result.reply.access_token;
    if (!result.ok || typeof accessToken !== "string" || !accessToken || accessToken.length > 16_384 ||
        (result.reply.scope !== undefined && (typeof result.reply.scope !== "string" || !result.reply.scope.split(" ").includes(GOOGLE_DRIVE_SCOPE)))) {
      throw new Error("Drive token unavailable");
    }
    // An overlapping disconnect/reconnect must invalidate the fetched credential.
    const current: { version: string; encryptedRefreshToken: string | null; reconnectRequired: boolean } | null =
      await ctx.runQuery(internal.googleDrive_queries.getConnection, { userId });
    if (!current || current.version !== connection.version || !current.encryptedRefreshToken || current.reconnectRequired) {
      throw new Error("Drive connection changed");
    }
    return { accessToken, connectionVersion: connection.version, ...(connection.folderId ? { folderId: connection.folderId } : {}) };
  } catch { throw new Error("Google Drive authorization is unavailable. Reconnect in Settings if this continues."); }
}
