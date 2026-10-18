import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { getFunctionName, type FunctionReference } from "convex/server";
import { auth } from "../auth";
import * as connections from "../googleDrive_queries";
import { callback } from "../googleDrive_http";
import {
  startConnection, finishConnection, handleOAuthCallback, getAuthorizedDriveCredentials,
  encryptDriveSecret, decryptDriveSecret,
} from "../googleDrive";
import { driveConfigured, driveSettingsReturnUrl, driveReturnOrigin, GOOGLE_DRIVE_SCOPE } from "../googleDriveConfig";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

type Args = Record<string, unknown>;
type Row = Args & { _id: string };
type Reference = FunctionReference<"query" | "mutation" | "action", "internal">;
const invoke = (fn: unknown, ctx: unknown, args: Args = {}) =>
  (fn as { _handler: (ctx: unknown, args: Args) => Promise<unknown> })._handler(ctx, args);
const now = 1_800_000_000_000;
const nonce = "a".repeat(64);
const digest = (value: string) => createHash("sha256").update(value).digest("base64url");

function setup(options: { connected?: boolean; settings?: Args } = {}) {
  const tables: Record<string, Row[]> = {
    users: [{ _id: "owner" }, { _id: "another" }],
    googleDriveConnections: options.connected ? [{
      _id: "connection", userId: "owner", version: "original-version", updatedAt: now - 20_000,
      encryptedRefreshToken: encryptDriveSecret("original-refresh", "owner", "refresh"), folderId: "original-folder", connectedAt: now - 10_000,
    }] : [],
    dataRetentionSettings: [{
      _id: "settings", userId: "owner", retentionPeriodDays: 90, autoCleanupEnabled: true, backupEnabled: true,
      backupIntervalHours: 336, collectionIntervalMinutes: 1, lastDriveBackupAt: 1234, lastCompleteBackupAt: 2345,
      ...options.settings,
    }],
  };
  const db = {
    get: vi.fn(async (id: string) => Object.values(tables).flat().find((row) => row._id === id) ?? null),
    query: vi.fn((table: string) => {
      if (!tables[table]) throw new Error(`Unexpected table ${table}`);
      const filters: Array<(row: Row) => boolean> = [];
      const range = { eq(field: string, value: unknown) { filters.push((row) => row[field] === value); return range; } };
      return {
        withIndex: vi.fn((index: string, configure: (queryRange: typeof range) => unknown) => {
          expect(["by_userId", "by_oauthStateHash"]).toContain(index);
          configure(range);
          return { first: async () => tables[table].find((row) => filters.every((filter) => filter(row))) ?? null };
        }),
      };
    }),
    patch: vi.fn(async (id: string, values: Args) => {
      const row = Object.values(tables).flat().find((entry) => entry._id === id)!;
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined) delete row[key]; else row[key] = value;
      }
    }),
    insert: vi.fn(async (table: string, fields: Args) => {
      const id = `row-${tables[table].length}`;
      tables[table].push({ _id: id, ...fields }); return id;
    }),
    delete: vi.fn(async (id: string) => {
      for (const rows of Object.values(tables)) { const index = rows.findIndex((row) => row._id === id); if (index >= 0) rows.splice(index, 1); }
    }),
  };
  let queue: Promise<unknown> = Promise.resolve();
  const ctx = {
    db, storage: { delete: vi.fn(async () => {}) }, scheduler: { runAfter: vi.fn<(delay: number, reference: Reference, args: Args) => Promise<string>>().mockResolvedValue("scheduled") },
    runQuery: vi.fn((reference: Reference, args: Args) => invoke(connections[getFunctionName(reference).split(":")[1] as keyof typeof connections], ctx, args)),
    runMutation: vi.fn((reference: Reference, args: Args) => {
      const result = queue.then(() => invoke(connections[getFunctionName(reference).split(":")[1] as keyof typeof connections], ctx, args));
      queue = result.catch(() => {}); return result;
    }),
    runAction: vi.fn((reference: Reference, args: Args) => {
      expect(getFunctionName(reference)).toBe("googleDrive:handleOAuthCallback");
      return invoke(handleOAuthCallback, ctx, args);
    }),
  };
  const begin = async () => {
    const result = await invoke(startConnection, ctx, { browserNonce: nonce }) as { url: string };
    const url = new URL(result.url); return { url, state: url.searchParams.get("state")! };
  };
  const exchange = async (state: string) => (await invoke(handleOAuthCallback, ctx, { state, code: "one-use-code", denied: false }) as { ready: boolean }).ready;
  const finish = async (state: string, browserNonce = nonce) => invoke(finishConnection, ctx, { state, browserNonce });
  return { ctx, db, tables, begin, exchange, finish,
    row: () => tables.googleDriveConnections.find((row) => row.userId === "owner")!, settings: () => tables.dataRetentionSettings[0] };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(auth.getUserId).mockResolvedValue("owner" as Awaited<ReturnType<typeof auth.getUserId>>);
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "public-test-client");
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "private-test-client-placeholder");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test/nested");
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
    const parameters = options.body as URLSearchParams;
    return new Response(JSON.stringify(parameters.get("grant_type") === "authorization_code"
      ? { refresh_token: "private-refresh-placeholder", access_token: "short-lived", scope: GOOGLE_DRIVE_SCOPE }
      : { access_token: "short-lived", scope: GOOGLE_DRIVE_SCOPE }), { status: 200 });
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Google Drive connection authorization", () => {
  it("authenticates every public action and mutation, with null status for anonymous users", async () => {
    const store = setup(); vi.mocked(auth.getUserId).mockResolvedValue(null);
    expect(await invoke(connections.status, store.ctx)).toBeNull();
    await expect(store.begin()).rejects.toThrow("Unauthorized");
    await expect(store.finish("a".repeat(43))).rejects.toThrow("Unauthorized");
    await expect(invoke(connections.disconnect, store.ctx)).rejects.toThrow("Unauthorized");
    expect(store.db.query).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY", "CONVEX_SITE_URL"])("fails closed without %s", async (name) => {
    vi.stubEnv(name, ""); const store = setup();
    expect(driveConfigured()).toBe(false);
    expect(await invoke(connections.status, store.ctx)).toMatchObject({ configured: false, connected: false });
    await expect(store.begin()).rejects.toThrow("not configured");
    expect(store.ctx.runMutation).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it("requests only per-file offline Drive authorization and protects state and PKCE verifier", async () => {
    const store = setup(); const { url, state } = await store.begin();
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "public-test-client", redirect_uri: "https://example.convex.site/google-drive/callback", scope: GOOGLE_DRIVE_SCOPE,
      access_type: "offline", response_type: "code", code_challenge_method: "S256", prompt: "consent select_account",
    });
    expect(store.row().oauthStateHash).toBe(digest(state));
    expect(store.row().oauthBrowserNonceHash).toBe(digest(nonce));
    const verifier = decryptDriveSecret(store.row().oauthEncryptedCodeVerifier as string, "owner", "verifier");
    expect(url.searchParams.get("code_challenge")).toBe(digest(verifier));
    expect(JSON.stringify(store.row())).not.toContain(state); expect(JSON.stringify(store.row())).not.toContain(verifier);
    expect(url.toString()).not.toMatch(/private-test|ENCRYPTION|client_secret/);
    expect(store.settings()).toMatchObject({ backupEnabled: true, backupIntervalHours: 336 });
  });

  it.each(["https://myecoflow.devrunor.com", "https://my-ecoflow.vercel.app"])("binds a known application origin to the pending attempt (%s)", async (returnOrigin) => {
    const store = setup();
    const result = await invoke(startConnection, store.ctx, { browserNonce: nonce, returnOrigin }) as { url: string };
    const state = new URL(result.url).searchParams.get("state")!;
    expect(store.row().oauthReturnOrigin).toBe(returnOrigin);
    expect(await invoke(handleOAuthCallback, store.ctx, { state, code: "code", denied: false })).toMatchObject({ ready: true, returnOrigin });
  });

  it.each(["https://attacker.test", "https://myecoflow.devrunor.com.evil.test", "https://myecoflow.devrunor.com/settings", "http://localhost:3000", "javascript:alert(1)"])("rejects an untrusted or non-origin return address (%s)", async (returnOrigin) => {
    const store = setup();
    await expect(invoke(startConnection, store.ctx, { browserNonce: nonce, returnOrigin })).rejects.toThrow("EcoFlow application");
    expect(store.ctx.runMutation).not.toHaveBeenCalled();
  });

  it("permits the configured local origin only when development crons are disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("DISABLE_CRONS", "false");
    expect(() => driveReturnOrigin("http://localhost:3000")).toThrow("EcoFlow application");
    vi.stubEnv("DISABLE_CRONS", "true");
    expect(driveReturnOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("keeps an existing Drive connection active when a new attempt starts or is denied", async () => {
    const store = setup({ connected: true }); const original = store.row().encryptedRefreshToken;
    const { state } = await store.begin();
    expect(await invoke(connections.status, store.ctx)).toMatchObject({ connected: true });
    expect(await invoke(handleOAuthCallback, store.ctx, { state, code: null, denied: true })).toMatchObject({ ready: false });
    expect(store.row().encryptedRefreshToken).toBe(original); expect(store.row().version).toBe("original-version");
    expect(store.row().oauthStateHash).toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
  });

  it("prepares a callback grant but requires the same signed-in owner and original browser nonce to activate it", async () => {
    const store = setup({ settings: { backupRun: { preparedStorageId: "prepared", driveManifestStorageId: "manifest" } } });
    const { state } = await store.begin(); expect(await store.exchange(state)).toBe(true);
    expect(store.row().encryptedRefreshToken).toBeUndefined(); expect(store.settings().backupDestination).toBeUndefined();
    vi.mocked(auth.getUserId).mockResolvedValue("another" as Awaited<ReturnType<typeof auth.getUserId>>);
    await expect(store.finish(state)).rejects.toThrow("another session");
    vi.mocked(auth.getUserId).mockResolvedValue("owner" as Awaited<ReturnType<typeof auth.getUserId>>);
    await expect(store.finish(state, "b".repeat(64))).rejects.toThrow("another session");
    expect(await store.finish(state)).toEqual({ success: true });
    expect(store.row().version).not.toBe("original-version");
    expect(decryptDriveSecret(store.row().encryptedRefreshToken as string, "owner", "refresh")).toBe("private-refresh-placeholder");
    expect(store.row().oauthStateHash).toBeUndefined(); expect(store.row().oauthEncryptedRefreshToken).toBeUndefined();
    expect(store.settings()).toMatchObject({ backupDestination: "googleDrive", backupEnabled: true, backupIntervalHours: 336, retentionPeriodDays: 90, collectionIntervalMinutes: 1, lastCompleteBackupAt: 2345 });
    expect(store.settings().lastDriveBackupAt).toBeUndefined(); expect(store.settings().backupRun).toBeUndefined();
    expect(store.ctx.storage.delete).toHaveBeenCalledWith("prepared"); expect(store.ctx.storage.delete).toHaveBeenCalledWith("manifest");
    await expect(store.finish(state)).rejects.toThrow("expired");
    const publicState = JSON.stringify(await invoke(connections.status, store.ctx));
    expect(publicState).not.toMatch(/private-refresh|encrypted|oauth|userId|version/);
    expect(store.db.query.mock.calls.map(([table]) => table)).not.toContain("deviceReadings");
  });

  it("creates disabled default settings for a new account without enabling backups", async () => {
    const store = setup(); store.tables.dataRetentionSettings.length = 0;
    const { state } = await store.begin(); await store.exchange(state); await store.finish(state);
    expect(store.settings()).toMatchObject({ backupDestination: "googleDrive", backupEnabled: false, backupIntervalHours: 24, retentionPeriodDays: 90, collectionIntervalMinutes: 5 });
  });

  it("rejects callback replay, unknown state, expiry, and wrong scope before activation", async () => {
    const store = setup(); const { state } = await store.begin();
    expect(await store.exchange("b".repeat(43))).toBe(false); expect(fetch).not.toHaveBeenCalled();
    expect(await Promise.all([store.exchange(state), store.exchange(state)])).toEqual([true, false]);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(Date.now).mockReturnValue(now + 10 * 60_000);
    await expect(store.finish(state)).rejects.toThrow("expired");
    expect(store.row().encryptedRefreshToken).toBeUndefined();
  });

  it.each([
    { access_token: "short-lived", scope: GOOGLE_DRIVE_SCOPE },
    { refresh_token: "private-token", scope: "https://www.googleapis.com/auth/userinfo.email" },
    { refresh_token: "private-token" },
    { error: "invalid_grant", provider_private_detail: "must-not-leak" },
  ])("rejects invalid or incomplete offline grants without exposing provider data (%j)", async (reply) => {
    const store = setup(); const { state } = await store.begin();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(reply), { status: 200 }));
    expect(await store.exchange(state)).toBe(false); expect(store.row().oauthStateHash).toBeUndefined();
    expect(store.row().encryptedRefreshToken).toBeUndefined();
  });

  it("does not exchange an expired authorization attempt or invalid browser nonce", async () => {
    const store = setup(); await expect(invoke(startConnection, store.ctx, { browserNonce: "short" })).rejects.toThrow("restart");
    const { state } = await store.begin(); vi.mocked(Date.now).mockReturnValue(now + 600_001);
    expect(await store.exchange(state)).toBe(false); expect(fetch).not.toHaveBeenCalled();
  });

  it("never activates a stale callback when another attempt replaced its state", async () => {
    const store = setup(); const { state } = await store.begin();
    vi.mocked(fetch).mockImplementationOnce(async () => {
      vi.mocked(Date.now).mockReturnValue(now + 11_000); await store.begin();
      return new Response(JSON.stringify({ refresh_token: "old-attempt", scope: GOOGLE_DRIVE_SCOPE }), { status: 200 });
    });
    expect(await store.exchange(state)).toBe(false); expect(store.row().oauthStatus).toBe("waiting");
    expect(store.row().oauthEncryptedRefreshToken).toBeUndefined();
  });

  it("binds authenticated encryption to user and purpose and rejects tampering or key rotation", () => {
    const encrypted = encryptDriveSecret("private-refresh-placeholder", "owner", "refresh");
    expect(encrypted).not.toContain("private-refresh-placeholder");
    expect(decryptDriveSecret(encrypted, "owner", "refresh")).toBe("private-refresh-placeholder");
    expect(() => decryptDriveSecret(encrypted, "another", "refresh")).toThrow("renewed");
    expect(() => decryptDriveSecret(encrypted, "owner", "verifier")).toThrow("renewed");
    expect(() => decryptDriveSecret(`${encrypted.slice(0, -4)}AAAA`, "owner", "refresh")).toThrow("renewed");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "b".repeat(64));
    expect(() => decryptDriveSecret(encrypted, "owner", "refresh")).toThrow("renewed");
  });
});

describe("Drive credential use and disconnection", () => {
  it("refreshes a server-only token and rechecks the active connection version", async () => {
    const store = setup({ connected: true });
    expect(await getAuthorizedDriveCredentials(store.ctx as never, "owner" as never, "original-version")).toEqual({ accessToken: "short-lived", connectionVersion: "original-version", folderId: "original-folder" });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://oauth2.googleapis.com/token"); expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.redirect).toBe("error");
    expect((options?.body as URLSearchParams).get("refresh_token")).toBe("original-refresh");
    await expect(getAuthorizedDriveCredentials(store.ctx as never, "owner" as never, "changed")).rejects.toThrow("changed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("marks revoked grants as needing reconnection while keeping provider details private", async () => {
    const store = setup({ connected: true });
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant", private_detail: "private-provider" }), { status: 400 }));
    await expect(getAuthorizedDriveCredentials(store.ctx as never, "owner" as never)).rejects.toThrow("authorization is unavailable");
    expect(store.row().reconnectRequired).toBe(true);
    expect(await invoke(connections.status, store.ctx)).toMatchObject({ connected: false, reconnectRequired: true });
  });

  it("does not let an old failed refresh invalidate a newer connection", async () => {
    const store = setup({ connected: true });
    vi.mocked(fetch).mockImplementationOnce(async () => {
      store.row().version = "new-connection";
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    });
    await expect(getAuthorizedDriveCredentials(store.ctx as never, "owner" as never)).rejects.toThrow("authorization is unavailable");
    expect(store.row().reconnectRequired).toBeUndefined();
  });

  it("rejects a bearer token fetched across a disconnect", async () => {
    const store = setup({ connected: true });
    vi.mocked(fetch).mockImplementationOnce(async () => {
      await invoke(connections.disconnect, store.ctx);
      return new Response(JSON.stringify({ access_token: "stale-token" }), { status: 200 });
    });
    await expect(getAuthorizedDriveCredentials(store.ctx as never, "owner" as never)).rejects.toThrow("authorization is unavailable");
  });

  it("disconnects only the signed-in owner, deletes active and pending secrets, cancels work, and preserves preferences and checkpoint", async () => {
    const store = setup({ connected: true, settings: { backupDestination: "googleDrive", backupRun: { preparedStorageId: "prepared" } } });
    store.tables.googleDriveConnections.push({ _id: "other-connection", userId: "another", version: "other", updatedAt: now });
    store.row().oauthEncryptedRefreshToken = encryptDriveSecret("pending-secret", "owner", "refresh");
    store.row().oauthStateHash = "pending-state";
    expect(await invoke(connections.disconnect, store.ctx)).toEqual({ success: true });
    expect(store.row()).toBeUndefined(); expect(store.tables.googleDriveConnections).toHaveLength(1);
    expect(store.tables.googleDriveConnections[0].userId).toBe("another");
    expect(store.settings()).toMatchObject({ backupDestination: "googleDrive", backupEnabled: true, backupIntervalHours: 336, lastDriveBackupAt: 1234 });
    expect(store.settings().backupRun).toBeUndefined();
    expect(store.ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not queue a provider revocation that could invalidate a fresh grant after reconnect", async () => {
    const store = setup({ connected: true });
    await invoke(connections.disconnect, store.ctx);
    expect(store.ctx.scheduler.runAfter).not.toHaveBeenCalled();
    const { state } = await store.begin();
    expect(await store.exchange(state)).toBe(true);
    expect(await store.finish(state)).toEqual({ success: true });
    expect(await getAuthorizedDriveCredentials(store.ctx as never, "owner" as never)).toMatchObject({ accessToken: "short-lived" });
    expect(store.ctx.scheduler.runAfter).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.every(([url]) => url === "https://oauth2.googleapis.com/token")).toBe(true);
  });

  it("requires expected-version CAS for folder allocation and reconnect flags", async () => {
    const store = setup({ connected: true });
    expect(await invoke(connections.setFolderId, store.ctx, { userId: "owner", version: "old", folderId: "injected" })).toBe(false);
    expect(await invoke(connections.setFolderId, store.ctx, { userId: "owner", version: "original-version", folderId: "different-folder" })).toBe(false);
    expect(await invoke(connections.setFolderId, store.ctx, { userId: "owner", version: "original-version", folderId: "original-folder" })).toBe(true);
    await invoke(connections.markReconnectRequired, store.ctx, { userId: "owner", version: "old" });
    expect(store.row().reconnectRequired).toBeUndefined();
  });
});

describe("Drive OAuth HTTP callback", () => {
  const call = (ctx: unknown, url: string) => (callback as unknown as { _handler: (ctx: unknown, request: Request) => Promise<Response> })._handler(ctx, new Request(url));
  it("redirects only to fixed Settings and exposes opaque state, never code or tokens", async () => {
    const store = setup(); const { state } = await store.begin();
    const response = await call(store.ctx, `https://example.convex.site/google-drive/callback?state=${state}&code=private-code&redirect=https://attacker.test`);
    const destination = new URL(response.headers.get("Location")!);
    expect(destination.origin + destination.pathname).toBe("https://app.example.test/settings");
    expect(Object.fromEntries(destination.searchParams)).toEqual({ drive: "finish", state });
    expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(destination.toString()).not.toMatch(/private-code|refresh|access_token|attacker/);
    expect(store.row().encryptedRefreshToken).toBeUndefined();
  });

  it("uses a generic error on denied or malformed callbacks and rejects unsafe configured origins", async () => {
    const store = setup(); const response = await call(store.ctx, "https://example.convex.site/google-drive/callback?state=bad&error=private-provider-error");
    expect(response.headers.get("Location")).toBe("https://app.example.test/settings?drive=error");
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "javascript:alert(1)");
    expect(driveSettingsReturnUrl().toString()).toBe("https://my-ecoflow.vercel.app/settings");
  });

  it("returns to the originating allowed custom domain so its session nonce remains available", async () => {
    const store = setup();
    const started = await invoke(startConnection, store.ctx, { browserNonce: nonce, returnOrigin: "https://myecoflow.devrunor.com" }) as { url: string };
    const state = new URL(started.url).searchParams.get("state")!;
    const response = await call(store.ctx, `https://example.convex.site/google-drive/callback?state=${state}&code=code`);
    expect(response.headers.get("Location")).toBe(`https://myecoflow.devrunor.com/settings?drive=finish&state=${state}`);
  });
});
