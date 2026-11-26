import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "./atomicWrite";

export const RECOVERY_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Crash-recovery copies of untitled documents, one file per recoveryId. */
export class RecoveryStore {
  constructor(private dir: string) {}
  private file(id: string): string {
    if (!RECOVERY_ID.test(id)) throw new Error("Invalid recovery id");
    return join(this.dir, `${id}.excalidraw`);
  }
  async write(id: string, json: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await atomicWriteFile(this.file(id), json);
  }
  async read(id: string): Promise<string | null> {
    return readFile(this.file(id), "utf8").catch(() => null);
  }
  async clear(id: string): Promise<void> {
    await unlink(this.file(id)).catch(() => {});
  }
  /** Ids of leftover recovery files, newest first. */
  async list(): Promise<string[]> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const ids = names.filter((n) => n.endsWith(".excalidraw")).map((n) => n.slice(0, -".excalidraw".length)).filter((id) => RECOVERY_ID.test(id));
    const withTime = await Promise.all(ids.map(async (id) => ({ id, t: (await stat(this.file(id))).mtimeMs })));
    return withTime.sort((a, b) => b.t - a.t).map((x) => x.id);
  }
}
