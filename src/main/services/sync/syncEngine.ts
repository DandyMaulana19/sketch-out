import { EventEmitter } from "node:events";
import type { CacheMeta, DriveFileInfo, SyncState } from "@shared/types";
import type { DriveClient } from "../drive/driveClient";
import type { CacheStore } from "../cache/cacheStore";
import { AuthRequiredError, DriveNetworkError, DriveNotFoundError } from "../errors";

export const UPLOAD_DEBOUNCE_MS = 2000;
export const BACKOFF_START_MS = 2000;
export const BACKOFF_MAX_MS = 60_000;

export interface SyncDeps {
  drive: DriveClient;
  cache: CacheStore;
  getFolderId(): Promise<string>;
  now(): number;
  initialOnline: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
export function conflictName(name: string, t: number): string {
  const d = new Date(t);
  return `${name} (konflik ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())})`;
}

/**
 * Offline-first sync of cached Drive documents. The cache is the source of truth; Drive is
 * brought up to date with optimistic concurrency on the file's `version`. Conflicts never
 * overwrite: local work is uploaded as a separate copy.
 */
export class SyncEngine extends EventEmitter {
  private online: boolean;
  private authBlocked = false;
  private states = new Map<string, SyncState>();
  private queues = new Map<string, Promise<unknown>>();
  private uploadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private backoff = new Map<string, number>();

  constructor(private deps: SyncDeps) {
    super();
    this.online = deps.initialOnline;
  }

  getState(localId: string): SyncState {
    return this.states.get(localId) ?? { localId, status: "synced", lastSyncedAt: null, error: null, notice: null };
  }

  getMeta(localId: string): Promise<CacheMeta> {
    return this.deps.cache.getMeta(localId);
  }

  listDirty(): Promise<CacheMeta[]> {
    return this.deps.cache.listDirty();
  }

  readCachedDoc(localId: string): Promise<string> {
    return this.deps.cache.readDoc(localId);
  }

  /** A rename bumps the Drive version; record it so the next upload is not treated as a conflict. */
  async noteRenamed(fileId: string, info: DriveFileInfo): Promise<void> {
    const m = await this.deps.cache.findByFileId(fileId);
    if (m) await this.deps.cache.updateMeta(m.localId, { name: info.name, baseVersion: info.version });
  }

  isOnline(): boolean {
    return this.online;
  }

  dismissNotice(localId: string): void {
    this.setState(localId, { notice: null });
  }

  setOnline(online: boolean): void {
    if (online === this.online) return;
    this.online = online;
    if (online) void this.syncAllDirty();
    else for (const [id, s] of this.states) if (s.status === "pending" || s.status === "syncing") this.setState(id, { status: "offline" });
  }

  /** Call after a successful sign-in: lifts the auth block and flushes everything pending. */
  onSignedIn(): Promise<void> {
    this.authBlocked = false;
    return this.syncAllDirty();
  }

  async createDriveDoc(name: string, json: string): Promise<CacheMeta> {
    const meta = await this.deps.cache.create({ fileId: null, name, json, baseVersion: null, dirty: true });
    this.setState(meta.localId, { status: this.online ? "pending" : "offline" });
    if (this.online) void this.syncNow(meta.localId);
    return meta;
  }

  async saveLocal(localId: string, json: string): Promise<void> {
    await this.deps.cache.writeDoc(localId, json);
    if (this.authBlocked) {
      this.setState(localId, { status: "error", error: "Perlu login ulang" });
      return;
    }
    this.setState(localId, { status: this.online ? "pending" : "offline" });
    if (this.online) this.scheduleUpload(localId);
  }

  async syncAllDirty(): Promise<void> {
    const dirty = await this.deps.cache.listDirty();
    await Promise.all(dirty.map((m) => this.syncNow(m.localId)));
  }

  /** Resolves once every queued sync/open has finished (timers that have not fired are not waited for). */
  async whenIdle(): Promise<void> {
    for (;;) {
      const snap = [...this.queues.values()];
      await Promise.all(snap);
      const after = [...this.queues.values()];
      if (after.length === snap.length && after.every((p, i) => p === snap[i])) return;
    }
  }

  syncNow(localId: string): Promise<SyncState> {
    return this.serial(localId, () => this.runSync(localId));
  }

  async openDriveFile(fileId: string): Promise<{ meta: CacheMeta; json: string }> {
    const { cache, drive } = this.deps;
    const cached = await cache.findByFileId(fileId);
    const fromCache = async () => {
      if (!cached) throw new Error("File belum tersedia offline");
      const meta = await cache.getMeta(cached.localId);
      return { meta, json: await cache.readDoc(meta.localId) };
    };
    if (!this.online) return fromCache();

    let remote: DriveFileInfo;
    try {
      remote = await drive.getMeta(fileId);
    } catch (err) {
      if (err instanceof DriveNetworkError) return fromCache();
      if (err instanceof DriveNotFoundError && cached) return fromCache();
      throw err;
    }

    if (!cached) {
      let json: string;
      try {
        json = await drive.download(fileId);
      } catch (err) {
        if (err instanceof DriveNetworkError) throw new Error("File belum tersedia offline");
        throw err;
      }
      const meta = await cache.create({ fileId, name: remote.name, json, baseVersion: remote.version, dirty: false });
      this.setState(meta.localId, { status: "synced", lastSyncedAt: this.deps.now() });
      return { meta, json };
    }

    if (remote.version === cached.baseVersion) return fromCache();
    if (!cached.dirty) {
      const json = await drive.download(fileId);
      const meta = await cache.replaceFromRemote(cached.localId, json, { baseVersion: remote.version, name: remote.name });
      this.setState(meta.localId, { status: "synced", lastSyncedAt: this.deps.now() });
      return { meta, json };
    }
    // Both sides changed: keep local work, let the sync turn it into a conflict copy.
    await this.syncNow(cached.localId);
    return fromCache();
  }

  // ───────────────────────────────────────────────────────────────

  private async runSync(localId: string): Promise<SyncState> {
    const { cache, drive, now } = this.deps;
    let meta = await cache.getMeta(localId);
    if (!meta.dirty) return this.setState(localId, { status: "synced" });
    if (this.authBlocked) return this.setState(localId, { status: "error", error: "Perlu login ulang" });
    if (!this.online) return this.setState(localId, { status: "offline" });

    this.setState(localId, { status: "syncing", error: null });
    const rev = cache.revision(localId);
    const json = await cache.readDoc(localId);
    try {
      const folderId = await this.deps.getFolderId();
      let info: DriveFileInfo;
      let notice: SyncState["notice"] | undefined;
      let name = meta.name;
      if (meta.fileId === null) {
        info = await drive.create(folderId, meta.name, json);
      } else {
        let remoteVersion: string | null;
        try {
          remoteVersion = (await drive.getMeta(meta.fileId)).version;
        } catch (err) {
          if (!(err instanceof DriveNotFoundError)) throw err;
          remoteVersion = null;
        }
        if (remoteVersion === meta.baseVersion) {
          info = await drive.update(meta.fileId, json);
        } else {
          name = remoteVersion === null ? meta.name : conflictName(meta.name, now());
          info = await drive.create(folderId, name, json);
          notice = { type: "conflict", copyName: name, originalFileId: meta.fileId };
        }
      }
      const result = await cache.markSynced(localId, rev, {
        fileId: info.id,
        name,
        baseVersion: info.version,
        lastSyncedAt: now(),
        lastError: null,
      });
      meta = result.meta;
      this.backoff.delete(localId);
      clearTimeout(this.retryTimers.get(localId));
      const patch: Partial<SyncState> = { status: result.clean ? "synced" : "pending", lastSyncedAt: now(), error: null };
      if (notice) patch.notice = notice;
      if (!result.clean) this.scheduleUpload(localId);
      return this.setState(localId, patch);
    } catch (err) {
      if (err instanceof DriveNetworkError) {
        this.scheduleRetry(localId);
        return this.setState(localId, { status: "offline" });
      }
      if (err instanceof AuthRequiredError) {
        this.authBlocked = true;
        await cache.updateMeta(localId, { lastError: "Perlu login ulang" });
        return this.setState(localId, { status: "error", error: "Perlu login ulang" });
      }
      const message = (err as Error).message || "Gagal menyinkron";
      await cache.updateMeta(localId, { lastError: message });
      return this.setState(localId, { status: "error", error: message });
    }
  }

  private scheduleUpload(localId: string): void {
    clearTimeout(this.uploadTimers.get(localId));
    this.uploadTimers.set(
      localId,
      setTimeout(() => {
        this.uploadTimers.delete(localId);
        void this.syncNow(localId);
      }, UPLOAD_DEBOUNCE_MS),
    );
  }

  private scheduleRetry(localId: string): void {
    const delay = this.backoff.get(localId) ?? BACKOFF_START_MS;
    this.backoff.set(localId, Math.min(delay * 2, BACKOFF_MAX_MS));
    clearTimeout(this.retryTimers.get(localId));
    this.retryTimers.set(
      localId,
      setTimeout(() => {
        this.retryTimers.delete(localId);
        void this.syncNow(localId);
      }, delay),
    );
  }

  private serial<T>(localId: string, fn: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(localId) ?? Promise.resolve()).then(fn, fn);
    this.queues.set(localId, next.catch(() => {}));
    return next;
  }

  private setState(localId: string, patch: Partial<SyncState>): SyncState {
    const next = { ...this.getState(localId), ...patch, localId };
    this.states.set(localId, next);
    this.emit("state", next);
    return next;
  }
}
