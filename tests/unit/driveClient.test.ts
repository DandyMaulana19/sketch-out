import { describe, it, expect, vi } from "vitest";
import { createDriveClient } from "../../src/main/services/drive/driveClient";
import { AuthRequiredError, DriveNetworkError, DriveNotFoundError } from "../../src/main/services/errors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const FILE = { id: "f1", name: "Diagram.excalidraw", modifiedTime: "2026-11-26T10:00:00Z", version: "7" };

function setup(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch;
  const getAccessToken = vi.fn(async () => "tok");
  return { drive: createDriveClient({ fetch: fetchFn, getAccessToken }), calls, getAccessToken };
}

describe("DriveClient", () => {
  it("creates files with a multipart upload carrying metadata and content", async () => {
    const { drive, calls } = setup(() => json(FILE));
    const r = await drive.create("folder1", "Diagram", '{"type":"excalidraw"}');
    expect(r).toEqual({ ...FILE, name: "Diagram" });
    const { url, init } = calls[0];
    expect(init.method).toBe("POST");
    expect(url).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?uploadType=multipart&fields=/);
    const body = String(init.body);
    const meta = JSON.parse(body.split("\r\n\r\n")[1].split("\r\n--")[0]);
    expect(meta).toEqual({ name: "Diagram.excalidraw", mimeType: "application/json", parents: ["folder1"], appProperties: { sketchOut: "1" } });
    expect(body).toContain('{"type":"excalidraw"}');
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("updates content with a media upload, even for multi-megabyte scenes", async () => {
    const big = JSON.stringify({ type: "excalidraw", files: { a: { dataURL: "x".repeat(8 * 1024 * 1024) } } });
    const { drive, calls } = setup(() => json(FILE));
    await drive.update("f1", big);
    expect(calls[0].init.method).toBe("PATCH");
    expect(calls[0].url).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\/f1\?uploadType=media/);
    expect(String(calls[0].init.body).length).toBe(big.length);
  });

  it("maps fetch TypeError and 5xx to DriveNetworkError, 404 to DriveNotFoundError", async () => {
    await expect(setup(() => { throw new TypeError("fetch failed"); }).drive.getMeta("f1")).rejects.toBeInstanceOf(DriveNetworkError);
    await expect(setup(() => json({}, 503)).drive.getMeta("f1")).rejects.toBeInstanceOf(DriveNetworkError);
    await expect(setup(() => json({}, 429)).drive.getMeta("f1")).rejects.toBeInstanceOf(DriveNetworkError);
    await expect(setup(() => json({}, 404)).drive.getMeta("f1")).rejects.toBeInstanceOf(DriveNotFoundError);
  });

  it("refreshes the token once on 401 and gives up with AuthRequiredError", async () => {
    const { drive, getAccessToken, calls } = setup(() => json({}, 401));
    await expect(drive.getMeta("f1")).rejects.toBeInstanceOf(AuthRequiredError);
    expect(calls).toHaveLength(2);
    expect(getAccessToken).toHaveBeenLastCalledWith({ forceRefresh: true });
  });

  it("retries successfully after a 401 when the refreshed token works", async () => {
    let n = 0;
    const { drive } = setup(() => (n++ === 0 ? json({}, 401) : json(FILE)));
    await expect(drive.getMeta("f1")).resolves.toEqual({ ...FILE, name: "Diagram" });
  });

  it("reuses an existing app folder instead of creating a new one", async () => {
    const { drive, calls } = setup(() => json({ files: [{ id: "existing" }] }));
    expect(await drive.ensureAppFolder()).toBe("existing");
    expect(calls).toHaveLength(1);
    const q = new URL(calls[0].url).searchParams.get("q")!;
    expect(q).toContain("mimeType='application/vnd.google-apps.folder'");
    expect(q).toContain("appProperties has { key='sketchOut' and value='1' }");
    expect(q).toContain("trashed=false");
  });

  it("creates the 'Sketch Out' folder when none exists", async () => {
    const { drive, calls } = setup((url) => (url.includes("q=") ? json({ files: [] }) : json({ id: "new" })));
    expect(await drive.ensureAppFolder()).toBe("new");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ name: "Sketch Out", mimeType: "application/vnd.google-apps.folder", appProperties: { sketchOut: "1" } });
  });

  it("lists non-trashed files in the folder, newest first, without the extension", async () => {
    const { drive, calls } = setup(() => json({ files: [FILE] }));
    expect(await drive.list("folder1")).toEqual([{ ...FILE, name: "Diagram" }]);
    const u = new URL(calls[0].url);
    expect(u.searchParams.get("q")).toBe("'folder1' in parents and trashed=false");
    expect(u.searchParams.get("orderBy")).toBe("modifiedTime desc");
  });

  it("downloads content, renames and trashes", async () => {
    const { drive, calls } = setup((url, init) => (url.includes("alt=media") ? new Response('{"a":1}') : json(FILE)));
    expect(await drive.download("f1")).toBe('{"a":1}');
    await drive.rename("f1", "Baru");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ name: "Baru.excalidraw" });
    await drive.trash("f1");
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ trashed: true });
  });
});
