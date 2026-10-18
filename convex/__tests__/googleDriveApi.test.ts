import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureDriveFile, ensureDriveFolder, generateDriveId } from "../googleDriveApi";

vi.mock("../googleDrive", () => ({ getAuthorizedDriveCredentials: vi.fn() }));
const bytes = new TextEncoder().encode('{"readings":[]}');
const sha256 = createHash("sha256").update(bytes).digest("hex");
const md5Checksum = createHash("md5").update(bytes).digest("hex");
const file = { id: "file-id", name: "part-1.json", mimeType: "application/json", parents: ["folder-id"],
  size: String(bytes.byteLength), md5Checksum, appProperties: { ecoflowSha256: sha256 } };
const args = { accessToken: "fake-access-token", id: file.id, parentId: "folder-id", name: file.name,
  bytes, mimeType: "application/json" as const, sha256 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("bounded verified Google Drive uploads", () => {
  it("reuses an exactly matching committed file after an uncertain response", async () => {
    vi.mocked(fetch).mockResolvedValue(json(file));
    expect(await ensureDriveFile(args)).toMatchObject({ id: file.id, size: bytes.byteLength, md5Checksum });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBeUndefined();
  });

  it("uploads to a fixed Google session and verifies provider size and checksums before success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(new Response(null, { headers: { location: "https://www.googleapis.com/upload/drive/v3/files?upload_id=fake" } }))
      .mockResolvedValueOnce(json({ id: file.id })).mockResolvedValueOnce(json(file));
    expect(await ensureDriveFile(args)).toMatchObject({ id: file.id });
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls.map(([, init]) => init?.method ?? "GET")).toEqual(["GET", "POST", "PUT", "GET"]);
    expect(JSON.parse(calls[1][1]!.body as string)).toMatchObject({ id: file.id, parents: ["folder-id"], appProperties: { ecoflowSha256: sha256 } });
    expect(await (calls[2][1]!.body as Blob).text()).toBe(new TextDecoder().decode(bytes));
    expect(calls.every(([, init]) => init?.redirect === "error")).toBe(true);
  });

  it.each([
    { size: "1" }, { md5Checksum: "different" }, { appProperties: {} }, { parents: ["other-folder"] },
    { trashed: true }, { mimeType: "text/plain" }, { name: "different.json" },
  ])("refuses an incomplete or conflicting file: %j", async mismatch => {
    vi.mocked(fetch).mockResolvedValue(json({ ...file, ...mismatch }));
    await expect(ensureDriveFile(args)).rejects.toMatchObject({ message: expect.stringContaining("integrity"), retryable: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a changed local checksum before sending credentials or bytes", async () => {
    await expect(ensureDriveFile({ ...args, sha256: "wrong" })).rejects.toThrow("checksum");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not send credentials to a provider-supplied foreign upload URL", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(new Response(null, { headers: { location: "https://example.test/upload" } }));
    await expect(ensureDriveFile(args)).rejects.toThrow("invalid upload session");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reconciles a duplicate create acknowledgement using the same persisted ID", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json({}, 409)).mockResolvedValueOnce(json(file));
    expect(await ensureDriveFile(args)).toMatchObject({ id: file.id });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("refuses oversized files before network activity", async () => {
    await expect(ensureDriveFile({ ...args, bytes: new Uint8Array(5 * 1024 * 1024 + 1) })).rejects.toThrow("budget");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sanitizes provider rejection details", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "private provider details" }, 403));
    await expect(ensureDriveFile(args)).rejects.toThrow("could not complete");
  });

  it("verifies folder type and parent and never requests public sharing", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ id: "folder-id", name: "Backup", mimeType: "application/vnd.google-apps.folder", parents: ["root-id"] }));
    expect(await ensureDriveFolder({ accessToken: "fake", id: "folder-id", parentId: "root-id", name: "Backup" })).toEqual({ id: "folder-id", webViewLink: "https://drive.google.com/drive/folders/folder-id" });
    vi.mocked(fetch).mockResolvedValue(json({ id: "folder-id", name: "Backup", mimeType: "text/plain", parents: ["root-id"] }));
    await expect(ensureDriveFolder({ accessToken: "fake", id: "folder-id", parentId: "root-id", name: "Backup" })).rejects.toThrow("could not be verified");
    expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes("permissions"))).toBe(true);
  });

  it("allocates only a valid provider file ID", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ ids: ["allocated-id"] }));
    expect(await generateDriveId("fake")).toBe("allocated-id");
    vi.mocked(fetch).mockResolvedValue(json({ ids: ["../../unsafe"] }));
    await expect(generateDriveId("fake")).rejects.toThrow("Invalid Drive");
  });
});
