import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { driveSettingsReturnUrl } from "./googleDriveConfig";

/** Google cannot provide app auth here. Single-use state only prepares a grant;
 * the signed-in owner and original browser nonce must finish it in Settings. */
export const callback = httpAction(async (ctx, request) => {
  const input = new URL(request.url);
  const state = input.searchParams.get("state") ?? "";
  let result: { ready: boolean; returnOrigin: string | null } = { ready: false, returnOrigin: null };
  try {
    result = await ctx.runAction(internal.googleDrive.handleOAuthCallback, {
      state, code: input.searchParams.get("code"), denied: input.searchParams.has("error"),
    });
  } catch { /* Provider details, authorization codes, and tokens stay private. */ }
  const destination = driveSettingsReturnUrl(result.returnOrigin ?? undefined);
  destination.searchParams.set("drive", result.ready ? "finish" : "error");
  if (result.ready) destination.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: {
    Location: destination.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
});
