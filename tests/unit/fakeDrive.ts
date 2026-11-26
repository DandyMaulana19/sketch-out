import type { DriveFileInfo } from "../../src/shared/types";
import type { DriveClient } from "../../src/main/services/drive/driveClient";
import { DriveNetworkError, DriveNotFoundError } from "../../src/main/services/errors";

interface FakeFile { id: string; name: string; json: string; version: number; parent: string; trashed: boolean }

/** In-memory Google Drive. version increments on every write, like the real API. */
export class FakeDrive implements DriveClient {
  files = new Map<string, FakeFile>();
  offline = false;
  calls: string[] = [];
  private failures: Error[] = [];
  private seq = 0;
  updateGate: Promise<void> | null = null;

  failNext(err: Error) { this.failures.push(err); }

  /** Simulate an edit made from another device or drive.google.com. */
  externalEdit(id: string, json: string) {
    const f = this.files.get(id)!;
    f.json = json;
    f.version++;
  }
  byName(name: string) { return [...this.files.values()].find((f) => f.name === name); }

  private info(f: FakeFile): DriveFileInfo {
    return { id: f.id, name: f.name, modifiedTime: new Date(0).toISOString(), version: String(f.version) };
  }
  private async gate(op: string) {
    this.calls.push(op);
    if (this.offline) throw new DriveNetworkError();
    const e = this.failures.shift();
    if (e) throw e;
  }
  private get(id: string) {
    const f = this.files.get(id);
    if (!f || f.trashed) throw new DriveNotFoundError();
    return f;
  }

  async ensureAppFolder() { await this.gate("ensureAppFolder"); return "folder"; }
  async list(folderId: string) { await this.gate("list"); return [...this.files.values()].filter((f) => f.parent === folderId && !f.trashed).map((f) => this.info(f)); }
  async getMeta(id: string) { await this.gate("getMeta"); return this.info(this.get(id)); }
  async download(id: string) { await this.gate("download"); return this.get(id).json; }
  async create(folderId: string, name: string, json: string) {
    await this.gate("create");
    const f = { id: `file${++this.seq}`, name, json, version: 1, parent: folderId, trashed: false };
    this.files.set(f.id, f);
    return this.info(f);
  }
  async update(id: string, json: string) {
    await this.gate("update");
    if (this.updateGate) await this.updateGate;
    const f = this.get(id);
    f.json = json;
    f.version++;
    return this.info(f);
  }
  async rename(id: string, name: string) { await this.gate("rename"); const f = this.get(id); f.name = name; f.version++; return this.info(f); }
  async trash(id: string) { await this.gate("trash"); this.get(id).trashed = true; }
}
