import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { auth } from "../auth";
import { sendMyTestEmail, sendTestEmail } from "../email";
import * as emailLog from "../email_log";

vi.mock("../auth", () => ({ auth: { getUserId: vi.fn() } }));

const now = 1_800_000_000_000;
type Args = Record<string, unknown>;
type Row = { _id: string; [field: string]: unknown };
type Reference = FunctionReference<"mutation", "internal">;
interface EmailResult { success: boolean; messageId?: string; error?: string }
const invoke = (fn: unknown, ctx: unknown, args: Args = {}) =>
  (fn as { _handler: (ctx: unknown, args: Args) => Promise<unknown> })._handler(ctx, args);

function setup(options: { user?: Row | null; logs?: Row[] } = {}) {
  const user = options.user === undefined ? { _id: "owner", email: "owner@example.test", firstName: '<Owner & "Friend">' } : options.user;
  const logs = options.logs ?? [];
  const db = {
    get: vi.fn(async (id: string) => user?._id === id ? user : logs.find((entry) => entry._id === id) ?? null),
    query: vi.fn((table: string) => {
      if (table !== "notificationLogs") throw new Error("Unexpected email table");
      const filters: Array<(entry: Row) => boolean> = [];
      const range = {
        eq(field: string, value: unknown) { filters.push((entry) => entry[field] === value); return range; },
        gt(field: string, value: number) { filters.push((entry) => (entry[field] as number) > value); return range; },
      };
      return {
        withIndex: vi.fn((name: string, configure: (q: typeof range) => unknown) => {
          expect(name).toBe("by_userId_type_sentAt");
          configure(range);
          return { first: async () => logs.find((entry) => filters.every((filter) => filter(entry))) ?? null };
        }),
      };
    }),
    insert: vi.fn(async (_table: string, values: Args) => {
      const id = `attempt-${logs.length + 1}`;
      logs.push({ _id: id, ...values });
      return id;
    }),
    patch: vi.fn(async (id: string, fields: Args) => { Object.assign(logs.find((entry) => entry._id === id)!, fields); }),
  };
  let mutationQueue: Promise<unknown> = Promise.resolve();
  const ctx = {
    db,
    runQuery: vi.fn(() => { throw new Error("Unexpected public email query"); }),
    runMutation: vi.fn((reference: Reference, args: Args) => {
      const fn = emailLog[getFunctionName(reference).split(":")[1] as keyof typeof emailLog];
      // Convex serializes conflicting mutation claims. Model that boundary while
      // allowing the two public actions and provider requests to overlap.
      const work = mutationQueue.then(() => invoke(fn, ctx, args));
      mutationQueue = work.catch(() => {});
      return work;
    }),
  };
  return { ctx, db, logs, request: (args: Args = {}) => invoke(sendMyTestEmail, ctx, args) as Promise<EmailResult> };
}

function message() {
  return JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string) as {
    from: string; to: string; subject: string; html: string; text: string;
  };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(auth.getUserId).mockResolvedValue("owner" as Awaited<ReturnType<typeof auth.getUserId>>);
  vi.stubEnv("RESEND_API_KEY", "test-placeholder-only");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "accepted-message" }), { status: 200 })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("authenticated test emails", () => {
  it("requires authentication before any recipient lookup, log claim, or provider request", async () => {
    const store = setup();
    vi.mocked(auth.getUserId).mockResolvedValue(null);
    await expect(store.request()).rejects.toThrow("Unauthorized");
    expect(store.ctx.runQuery).not.toHaveBeenCalled();
    expect(store.ctx.runMutation).not.toHaveBeenCalled();
    expect(store.db.get).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves only the signed-in recipient, sends accessible escaped HTML and plain text, and logs acceptance", async () => {
    const store = setup();
    const result = await store.request({ to: "attacker@example.test", userId: "another-owner" });
    expect(result).toEqual({ success: true, messageId: "accepted-message" });
    expect(store.ctx.runMutation).toHaveBeenCalledWith(expect.anything(), { userId: "owner" });
    expect(message().to).toBe("owner@example.test");
    expect(message().from).toBe("EcoFlow Dashboard <alerts@devrunor.com>");
    expect(message().html).toContain("&lt;Owner &amp; &quot;Friend&quot;&gt;");
    expect(message().html).not.toContain('<Owner & "Friend">');
    expect(message().html).toContain('<html lang="en" dir="ltr">');
    expect(message().html).toContain('<div lang="en" dir="ltr"');
    expect(message().html).toContain("<title>EcoFlow Dashboard email test</title>");
    expect(message().html).toContain("https://app.example.test/settings");
    expect(message().text).toContain('Hello <Owner & "Friend">');
    expect(store.logs).toEqual([expect.objectContaining({
      userId: "owner", type: "test_email", email: "owner@example.test", status: "sent", messageId: "accepted-message", sentAt: now,
    })]);
    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect((options?.headers as Record<string, string>)["Idempotency-Key"]).toBe("ecoflow-test-email-attempt-1");
    expect(JSON.stringify(result)).not.toMatch(/test-placeholder|owner@example/);
  });

  it("claims concurrent requests atomically across sessions and retries only after 60 seconds", async () => {
    const store = setup();
    const results = await Promise.all([store.request(), store.request()]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.find((result) => !result.success)?.error).toMatch(/wait a minute/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.logs).toHaveLength(1);
    vi.mocked(Date.now).mockReturnValue(now + 59_999);
    expect((await store.request()).success).toBe(false);
    vi.mocked(Date.now).mockReturnValue(now + 60_000);
    expect((await store.request()).success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reserves a pending attempt before contacting the provider and rate-limits failed attempts too", async () => {
    const store = setup();
    vi.mocked(fetch).mockImplementationOnce(async () => {
      expect(store.logs[0].status).toBe("pending");
      return new Response(JSON.stringify({ message: "private provider detail" }), { status: 403 });
    });
    expect((await store.request()).success).toBe(false);
    expect(store.logs[0].status).toBe("failed");
    expect((await store.request()).error).toMatch(/wait a minute/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not let other owners' attempts or a busy alert history block this account's diagnostic", async () => {
    const store = setup({ logs: [
      { _id: "other", userId: "other-owner", type: "test_email", sentAt: now, status: "sent" },
      ...Array.from({ length: 100 }, (_, index) => ({ _id: `alert-${index}`, userId: "owner", type: "device_alert_low_battery", sentAt: now, status: "sent" })),
    ] });
    expect((await store.request()).success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([null, { _id: "owner" }, { _id: "owner", email: "invalid" }])("rejects missing or invalid account email (%j)", async (user) => {
    const store = setup({ user });
    expect(await store.request()).toEqual({ success: false, error: "Your account does not have a valid email address." });
    expect(store.logs).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces missing server configuration and records the failed attempt without contacting Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const store = setup();
    expect(await store.request()).toEqual({ success: false, error: "Email service is not configured." });
    expect(fetch).not.toHaveBeenCalled();
    expect(store.logs[0]).toMatchObject({ status: "failed", errorMessage: "Email service is not configured." });
  });

  it.each([400, 401, 403, 422, 429, 500])("returns a useful sanitized provider rejection (%s)", async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: "secret-key-private-provider-detail" }), { status }));
    const store = setup();
    const result = await store.request();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/email provider/i);
    expect(result.messageId).toBeUndefined();
    expect(store.logs[0]).toMatchObject({ status: "failed", errorMessage: result.error });
    expect(JSON.stringify([result, store.logs])).not.toContain("secret-key-private-provider-detail");
  });

  it("does not treat an accepted response without a message ID as confirmed success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const store = setup();
    expect(await store.request()).toMatchObject({ success: false, error: expect.stringContaining("incomplete response") });
    expect(store.logs[0].status).toBe("failed");
  });

  it("reports an uncertain network outcome without automatic retries or raw errors", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("secret-private-network-error"));
    const store = setup();
    const result = await store.request();
    expect(result).toMatchObject({ success: false, error: expect.stringContaining("could not be confirmed") });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(store.logs[0].status).toBe("failed");
    expect(JSON.stringify([result, store.logs])).not.toContain("secret-private-network-error");
  });

  it("does not claim success when the provider accepts but the notification log cannot be updated", async () => {
    const store = setup();
    store.db.patch.mockRejectedValueOnce(new Error("private-db-error"));
    const result = await store.request();
    expect(result).toEqual({ success: false, messageId: "accepted-message", error: "The test email status could not be saved. Check your inbox before trying again." });
    expect(store.logs[0].status).toBe("pending");
  });

  it("retains the trusted internal entrypoint using the shared sender and result logging", async () => {
    const store = setup();
    expect(await invoke(sendTestEmail, store.ctx, { to: "trusted@example.test", userId: "owner" })).toEqual({ success: true, messageId: "accepted-message" });
    expect(message().to).toBe("trusted@example.test");
    expect(store.logs[0]).toMatchObject({ userId: "owner", status: "sent", messageId: "accepted-message" });
  });

  it("refuses to finalize an unrelated owner's notification attempt", async () => {
    const store = setup({ logs: [{ _id: "another-attempt", userId: "another-owner", type: "test_email", status: "pending" }] });
    await expect(invoke(emailLog.finishTestEmailAttempt, store.ctx, {
      logId: "another-attempt", userId: "owner", status: "sent", messageId: "accepted",
    })).rejects.toThrow("Test email attempt unavailable");
    expect(store.db.patch).not.toHaveBeenCalled();
  });
});
