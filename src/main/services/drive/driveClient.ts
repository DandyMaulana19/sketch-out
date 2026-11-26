import type { DriveFileInfo } from "@shared/types";
import { AuthRequiredError, DriveNetworkError, DriveNotFoundError } from "../errors";

export interface DriveClient {
  ensureAppFolder(): Promise<string>;
  list(folderId: string): Promise<DriveFileInfo[]>;
  getMeta(fileId: string): Promise<DriveFileInfo>;
  download(fileId: string): Promise<string>;
  create(folderId: string, name: string, json: string): Promise<DriveFileInfo>;
  update(fileId: string, json: string): Promise<DriveFileInfo>;
  rename(fileId: string, name: string): Promise<DriveFileInfo>;
  trash(fileId: string): Promise<void>;
}

export interface DriveDeps {
  fetch: typeof fetch;
  getAccessToken(opts?: { forceRefresh?: boolean }): Promise<string>;
}

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FIELDS = "id,name,modifiedTime,version";
const FOLDER_MIME = "application/vnd.google-apps.folder";
export const APP_FOLDER_NAME = "Sketch Out";
const APP_PROPS = { sketchOut: "1" };
const EXT = ".excalidraw";
const META_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;

const withExt = (name: string) => (name.toLowerCase().endsWith(EXT) ? name : `${name}${EXT}`);
const display = (f: DriveFileInfo): DriveFileInfo => ({
  id: f.id,
  name: f.name.toLowerCase().endsWith(EXT) ? f.name.slice(0, -EXT.length) : f.name,
  modifiedTime: f.modifiedTime,
  version: String(f.version),
});

export function createDriveClient(deps: DriveDeps): DriveClient {
  async function request(url: string, init: RequestInit = {}, timeoutMs = META_TIMEOUT_MS): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await deps.getAccessToken(attempt ? { forceRefresh: true } : undefined);
      let res: Response;
      try {
        res = await deps.fetch(url, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new DriveNetworkError();
      }
      if (res.status === 401) continue;
      if (res.status === 404) throw new DriveNotFoundError();
      if (res.status >= 500 || res.status === 429) throw new DriveNetworkError(`Google Drive sedang bermasalah (${res.status})`);
      if (res.status === 403) {
        const body = (await res.clone().json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[] } };
        const reason = body.error?.errors?.[0]?.reason ?? "";
        if (/rateLimit|userRateLimit/i.test(reason)) throw new DriveNetworkError("Batas permintaan Drive tercapai");
      }
      if (!res.ok) throw new Error(`Google Drive menolak permintaan (${res.status})`);
      return res;
    }
    throw new AuthRequiredError();
  }
  const getJson = async <T>(url: string, init?: RequestInit, timeoutMs?: number) => (await request(url, init, timeoutMs)).json() as Promise<T>;

  return {
    async ensureAppFolder() {
      const q = `mimeType='${FOLDER_MIME}' and appProperties has { key='sketchOut' and value='1' } and trashed=false`;
      const found = await getJson<{ files: { id: string }[] }>(`${API}?${new URLSearchParams({ q, fields: "files(id)", spaces: "drive", pageSize: "1" })}`);
      if (found.files[0]) return found.files[0].id;
      const created = await getJson<{ id: string }>(`${API}?fields=id`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: APP_FOLDER_NAME, mimeType: FOLDER_MIME, appProperties: APP_PROPS }),
      });
      return created.id;
    },

    async list(folderId) {
      const out: DriveFileInfo[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed=false`,
          fields: `nextPageToken,files(${FIELDS})`,
          orderBy: "modifiedTime desc",
          pageSize: "200",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const r = await getJson<{ files: DriveFileInfo[]; nextPageToken?: string }>(`${API}?${params}`);
        out.push(...r.files.map(display));
        pageToken = r.nextPageToken;
      } while (pageToken);
      return out;
    },

    async getMeta(fileId) {
      return display(await getJson<DriveFileInfo>(`${API}/${encodeURIComponent(fileId)}?fields=${FIELDS}`));
    },

    async download(fileId) {
      return (await request(`${API}/${encodeURIComponent(fileId)}?alt=media`, {}, UPLOAD_TIMEOUT_MS)).text();
    },

    async create(folderId, name, json) {
      const boundary = `sketchout-${Math.random().toString(36).slice(2)}`;
      const meta = { name: withExt(name), mimeType: "application/json", parents: [folderId], appProperties: APP_PROPS };
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
      return display(
        await getJson<DriveFileInfo>(
          `${UPLOAD}?uploadType=multipart&fields=${FIELDS}`,
          { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body },
          UPLOAD_TIMEOUT_MS,
        ),
      );
    },

    async update(fileId, json) {
      return display(
        await getJson<DriveFileInfo>(
          `${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&fields=${FIELDS}`,
          { method: "PATCH", headers: { "content-type": "application/json" }, body: json },
          UPLOAD_TIMEOUT_MS,
        ),
      );
    },

    async rename(fileId, name) {
      return display(
        await getJson<DriveFileInfo>(`${API}/${encodeURIComponent(fileId)}?fields=${FIELDS}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: withExt(name) }),
        }),
      );
    },

    async trash(fileId) {
      await request(`${API}/${encodeURIComponent(fileId)}?fields=id`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      });
    },
  };
}
