/** Server-only configuration shared by Drive queries and actions. */
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_OAUTH_TTL_MS = 10 * 60_000;

export function driveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
    /^[a-fA-F0-9]{64}$/.test(process.env.TOKEN_ENCRYPTION_KEY ?? "") &&
    validSiteUrl(process.env.CONVEX_SITE_URL));
}

function validSiteUrl(value: string | undefined): boolean {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

export function driveRedirectUri(): string {
  if (!validSiteUrl(process.env.CONVEX_SITE_URL)) throw new Error("Google Drive is not configured.");
  return new URL("/google-drive/callback", process.env.CONVEX_SITE_URL).toString();
}

export function driveReturnOrigin(requested?: string): string {
  const fallback = "https://my-ecoflow.vercel.app";
  const allowed = new Set([fallback, "https://myecoflow.devrunor.com"]);
  let configuredOrigin = fallback;
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_APP_URL || fallback);
    if (configured.protocol === "https:" || (process.env.DISABLE_CRONS === "true" && configured.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(configured.hostname))) {
      configuredOrigin = configured.origin; allowed.add(configured.origin);
    }
  } catch { /* Invalid server configuration cannot create an open redirect. */ }
  if (!requested) return configuredOrigin;
  try {
    const candidate = new URL(requested);
    if (candidate.origin === requested && allowed.has(candidate.origin)) return candidate.origin;
  } catch { /* Public callers receive only a sanitized configuration error. */ }
  throw new Error("Connect Google Drive from the EcoFlow application.");
}

export function driveSettingsReturnUrl(origin?: string): URL {
  try { return new URL("/settings", driveReturnOrigin(origin)); }
  catch { return new URL("https://my-ecoflow.vercel.app/settings"); }
}
