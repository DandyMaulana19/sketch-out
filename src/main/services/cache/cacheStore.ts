import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CacheMeta } from "@shared/types";
import { atomicWriteFile } from "../atomicWrite";

const LOCAL_ID = /^[0-9a-f-]{36}$/;

/**
 * Offline copy of every Drive document: drive-cache/<localId>/{doc.excalidraw,meta.json}.
 * The doc file is always written before the meta flips to dirty, so a crash never marks
 * unsaved content as clean.
 */
export class CacheStore {
  private metas = new Map<string, CacheMeta>();
  private loaded: Promise<void> | null = null;
  private queues = new Map<string, Promise<unknown>>();
  private revisions = new Map<string, number>();

  constructor(private root: string) {}

  private dir(localId: string): string {
    if (!LOCAL_ID.test(localId)) throw new Error("Invalid localId");
    return join(this.root, localId);
  }

  private serial<T>(localId: string, fn: () => Promise<T>): Promise<T> {
    const next = (this.queues.get(localId) ?? Promise.resolve()).then(fn, fn);
    this.queues.set(localId, next.catch(() => {}));
    return next;
  }

  private load(): Promise<void> {
    this.loaded ??= (async () => {
      const names = await readdir(this.root).catch(() => [] as string[]);
      for (const n of names) {
        if (!LOCAL_ID.test(n)) continue;
        try {
          const m = JSON.parse(await readFile(join(this.root, n, "meta.json"), "utf8")) as CacheMeta;
          if (m.localId === n) this.metas.set(n, m);
        } catch (err) {
          console.warn(`[cache] skipping ${n}: ${(err as Error).message}`);
        }
      }
    })();
    return this.loaded;
  }

  private async persistMeta(m: CacheMeta): Promise<void> {
    await atomicWriteFile(join(this.dir(m.localId), "meta.json"), JSON.stringify(m));
    this.metas.set(m.localId, m);
  }

  async create(init: { fileId: string | null; name: string; json: string; baseVersion: string | null; dirty: boolean }): Promise<CacheMeta> {
    await this.load();
    const localId = randomUUID();
    const m: CacheMeta = { localId, fileId: init.fileId, name: init.name, baseVersion: init.baseVersion, dirty: init.dirty, lastSyncedAt: null, lastError: null };
    return this.serial(localId, async () => {
      await mkdir(this.dir(localId), { recursive: true });
      await atomicWriteFile(join(this.dir(localId), "doc.excalidraw"), init.json);
      await this.persistMeta(m);
      return m;
    });
  }

  async writeDoc(localId: string, json: string): Promise<number> {
    const dir = this.dir(localId);
    await this.load();
    const rev = (this.revisions.get(localId) ?? 0) + 1;
    this.revisions.set(localId, rev);
    await this.serial(localId, async () => {
      await atomicWriteFile(join(dir, "doc.excalidraw"), json);
      const m = this.metas.get(localId);
      if (!m) throw new Error("Unknown document");
      if (!m.dirty) await this.persistMeta({ ...m, dirty: true });
    });
    return rev;
  }

  revision(localId: string): number {
    return this.revisions.get(localId) ?? 0;
  }

  async readDoc(localId: string): Promise<string> {
    return readFile(join(this.dir(localId), "doc.excalidraw"), "utf8");
  }

  async getMeta(localId: string): Promise<CacheMeta> {
    this.dir(localId);
    await this.load();
    const m = this.metas.get(localId);
    if (!m) throw new Error("Unknown document");
    return m;
  }

  async updateMeta(localId: string, patch: Partial<Omit<CacheMeta, "localId">>): Promise<CacheMeta> {
    this.dir(localId);
    await this.load();
    return this.serial(localId, async () => {
      const m = this.metas.get(localId);
      if (!m) throw new Error("Unknown document");
      const next = { ...m, ...patch };
      await this.persistMeta(next);
      return next;
    });
  }

  async findByFileId(fileId: string): Promise<CacheMeta | null> {
    await this.load();
    for (const m of this.metas.values()) if (m.fileId === fileId) return m;
    return null;
  }

  async listDirty(): Promise<CacheMeta[]> {
    await this.load();
    return [...this.metas.values()].filter((m) => m.dirty);
  }

  async listAll(): Promise<CacheMeta[]> {
    await this.load();
    return [...this.metas.values()];
  }
}
