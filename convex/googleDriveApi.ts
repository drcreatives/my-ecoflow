"use node";

import { createHash } from "node:crypto";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getAuthorizedDriveCredentials } from "./googleDrive";

const API = "https://www.googleapis.com/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";
const FIELDS = "id,name,mimeType,parents,trashed,size,md5Checksum,appProperties";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
interface Metadata {
  id: string; name: string; mimeType: string; parents?: string[];
  trashed?: boolean; size?: string; md5Checksum?: string;
  appProperties?: Record<string, string>;
}

export class DriveError extends Error {
  constructor(message: string, readonly retryable = true) { super(message); }
}

function checkedId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id)) throw new DriveError("Invalid Drive file reference", false);
  return id;
}

async function request(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, {
      ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` },
      redirect: "error", signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new DriveError("Google Drive did not acknowledge the request");
  }
}

function rejected(response: Response): never {
  throw new DriveError("Google Drive could not complete the backup upload", response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500);
}

async function metadata(token: string, id: string): Promise<Metadata | null> {
  const response = await request(`${API}/files/${checkedId(id)}?fields=${FIELDS}`, token);
  if (response.status === 404) return null;
  if (!response.ok) rejected(response);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("id" in value) || value.id !== id) {
    throw new DriveError("Google Drive did not return the requested file");
  }
  return value as Metadata;
}

export async function generateDriveId(accessToken: string): Promise<string> {
  const response = await request(`${API}/files/generateIds?count=1&space=drive&type=files`, accessToken);
  if (!response.ok) rejected(response);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object" || !("ids" in value) || !Array.isArray(value.ids) || typeof value.ids[0] !== "string") {
    throw new DriveError("Google Drive did not allocate a file reference");
  }
  return checkedId(value.ids[0]);
}

export async function ensureDriveFolder(args: {
  accessToken: string; id: string; parentId: string; name: string;
}): Promise<{ id: string; webViewLink: string }> {
  checkedId(args.parentId);
  let file = await metadata(args.accessToken, args.id);
  if (!file) {
    const response = await request(`${API}/files?fields=${FIELDS}`, args.accessToken, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: args.id, name: args.name, mimeType: FOLDER, parents: [args.parentId] }),
    });
    if (!response.ok && response.status !== 409) rejected(response);
    file = await metadata(args.accessToken, args.id);
  }
  if (!file || file.trashed || file.mimeType !== FOLDER || file.name !== args.name ||
      (args.parentId !== "root" && !file.parents?.includes(args.parentId))) {
    throw new DriveError("The private Drive backup folder could not be verified", false);
  }
  return { id: file.id, webViewLink: `https://drive.google.com/drive/folders/${file.id}` };
}

export async function getDriveAccess(ctx: ActionCtx, userId: Id<"users">, expectedConnectionVersion?: string): Promise<{
  accessToken: string; connectionVersion: string; rootFolderId: string;
}> {
  const credentials = await getAuthorizedDriveCredentials(ctx, userId, expectedConnectionVersion);
  let folderId = credentials.folderId;
  if (!folderId) {
    const candidate = await generateDriveId(credentials.accessToken);
    await ctx.runMutation(internal.googleDrive_queries.setFolderId, {
      userId, version: credentials.connectionVersion, folderId: candidate,
    });
    const saved = await ctx.runQuery(internal.googleDrive_queries.getConnection, { userId });
    if (!saved || saved.version !== credentials.connectionVersion || !saved.folderId || !saved.encryptedRefreshToken || saved.reconnectRequired) {
      throw new DriveError("Google Drive connection changed; reconnect before retrying", false);
    }
    folderId = saved.folderId;
  }
  await ensureDriveFolder({ accessToken: credentials.accessToken, id: folderId, parentId: "root", name: "EcoFlow Backups" });
  return { accessToken: credentials.accessToken, connectionVersion: credentials.connectionVersion, rootFolderId: folderId };
}

export async function ensureDriveFile(args: {
  accessToken: string; id: string; parentId: string; name: string;
  bytes: Uint8Array; mimeType: "application/json"; sha256: string;
}): Promise<{ id: string; size: number; md5Checksum: string; webViewLink: string }> {
  checkedId(args.id); checkedId(args.parentId);
  if (args.bytes.byteLength > MAX_FILE_BYTES || args.bytes.byteLength === 0) throw new DriveError("Backup file exceeds its bounded upload budget", false);
  const sha256 = createHash("sha256").update(args.bytes).digest("hex");
  const md5 = createHash("md5").update(args.bytes).digest("hex");
  if (sha256 !== args.sha256) throw new DriveError("Prepared backup checksum changed", false);
  let file = await metadata(args.accessToken, args.id);
  if (!file) {
    const started = await request(`https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=${FIELDS}`, args.accessToken, {
      method: "POST", headers: {
        "Content-Type": "application/json", "X-Upload-Content-Type": args.mimeType,
        "X-Upload-Content-Length": String(args.bytes.byteLength),
      },
      body: JSON.stringify({ id: args.id, name: args.name, mimeType: args.mimeType,
        parents: [args.parentId], appProperties: { ecoflowSha256: sha256 } }),
    });
    if (started.status !== 409) {
      if (!started.ok) rejected(started);
      const location = started.headers.get("location");
      let session: URL;
      try { session = new URL(location ?? ""); } catch { throw new DriveError("Google Drive did not provide an upload session"); }
      if (session.origin !== "https://www.googleapis.com" || session.pathname !== "/upload/drive/v3/files" || session.username || session.password || session.hash) {
        throw new DriveError("Google Drive returned an invalid upload session", false);
      }
      const uploaded = await request(session.toString(), args.accessToken, {
        method: "PUT", headers: { "Content-Type": args.mimeType, "Content-Length": String(args.bytes.byteLength) },
        body: new Blob([new Uint8Array(args.bytes)]),
      });
      if (!uploaded.ok && uploaded.status !== 409) rejected(uploaded);
    }
    // Read provider metadata even after success: acknowledgements alone must
    // never authorize retention when a file is incomplete or mismatched.
    file = await metadata(args.accessToken, args.id);
  }
  if (!file || file.trashed || file.name !== args.name || file.mimeType !== args.mimeType ||
      !file.parents?.includes(args.parentId) || file.size !== String(args.bytes.byteLength) ||
      file.md5Checksum !== md5 || file.appProperties?.ecoflowSha256 !== sha256) {
    throw new DriveError("Uploaded Drive backup failed integrity verification", false);
  }
  return { id: file.id, size: args.bytes.byteLength, md5Checksum: md5, webViewLink: `https://drive.google.com/file/d/${file.id}/view` };
}
