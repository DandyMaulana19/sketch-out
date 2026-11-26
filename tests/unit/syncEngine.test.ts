import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CacheStore } from "../../src/main/services/cache/cacheStore";
import { SyncEngine } from "../../src/main/services/sync/syncEngine";
import { AuthRequiredError, DriveNetworkError } from "../../src/main/services/errors";
import type { SyncState } from "../../src/shared/types";
import { FakeDrive } from "./fakeDrive";

const NOW = new Date(2026, 10, 26, 14, 5).getTime();

async function setup(opts: { dir?: string; drive?: FakeDrive; online?: boolean } = {}) {
  const dir = opts.dir ?? (await mkdtemp(join(tmpdir(), "so-sync-")));
  const drive = opts.drive ?? new FakeDrive();
  const cache = new CacheStore(dir);
  const engine = new SyncEngine({ drive, cache, getFolderId: async () => "folder", now: () => NOW, initialOnline: opts.online ?? true });
  current.push(engine);
  const states: SyncState[] = [];
  engine.on("state", (s: SyncState) => states.push(s));
  return { dir, drive, cache, engine, states };
}

let current: SyncEngine[] = [];
/** Let queued syncs and fs work finish without advancing fake time. */
const settle = async () => {
  for (let i = 0; i < 5; i++) {
    await vi.advanceTimersByTimeAsync(0);
    for (const e of current) await e.whenIdle();
    await new Promise((r) => setImmediate(r));
  }
};

/** Poll (without waiting on queues) until cond holds — for states reached while a sync is blocked. */
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 500 && !cond(); i++) {
    await vi.advanceTimersByTimeAsync(0);
    await new Promise((r) => setImmediate(r));
  }
  expect(cond()).toBe(true);
};

describe("SyncEngine", () => {
  beforeEach(() => {
    current = [];
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => vi.useRealTimers());

  it("offline then online: keeps work local, uploads when connectivity returns", async () => {
    const { drive, engine } = await setup({ online: false });
    const meta = await engine.createDriveDoc("Diagram", '{"v":1}');
    await engine.saveLocal(meta.localId, '{"v":2}');
    await vi.advanceTimersByTimeAsync(2500);
    expect(engine.getState(meta.localId).status).toBe("offline");
    expect(drive.calls).toEqual([]);
    engine.setOnline(true);
    await settle();
    expect(engine.getState(meta.localId).status).toBe("synced");
    expect(drive.byName("Diagram")!.json).toBe('{"v":2}');
  });

  it("debounces uploads to 2000 ms after the last local save", async () => {
    const { drive, engine } = await setup();
    const meta = await engine.createDriveDoc("D", "{0}");
    await settle();
    drive.calls = [];
    await engine.saveLocal(meta.localId, "{1}");
    await vi.advanceTimersByTimeAsync(1000);
    await engine.saveLocal(meta.localId, "{2}");
    await vi.advanceTimersByTimeAsync(1999);
    expect(drive.calls).not.toContain("update");
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(drive.calls.filter((c) => c === "update")).toHaveLength(1);
  });

  it("a failed upload goes offline and retries with backoff 2s, 4s, 8s … capped at 60s", async () => {
    const { drive, engine } = await setup();
    const meta = await engine.createDriveDoc("D", "{0}");
    await settle();
    await engine.saveLocal(meta.localId, "{1}");
    for (let i = 0; i < 8; i++) drive.failNext(new DriveNetworkError());
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(engine.getState(meta.localId).status).toBe("offline");
    const delays = [2000, 4000, 8000, 16000, 32000, 60000, 60000];
    for (const d of delays) {
      const before = drive.calls.length;
      await vi.advanceTimersByTimeAsync(d - 1);
      expect(drive.calls.length).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      await settle();
      expect(drive.calls.length).toBeGreaterThan(before);
    }
    await vi.advanceTimersByTimeAsync(60000);
    await settle();
    expect(engine.getState(meta.localId).status).toBe("synced");
    expect(drive.byName("D")!.json).toBe("{1}");
  });

  it("version conflict: saves local work as a copy and leaves the Drive file untouched", async () => {
    const { drive, engine } = await setup();
    const meta = await engine.createDriveDoc("Diagram", "{0}");
    await settle();
    const fileId = (await engine.getMeta(meta.localId)).fileId!;
    drive.externalEdit(fileId, "{remote}");
    await engine.saveLocal(meta.localId, "{mine}");
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    const copy = drive.byName("Diagram (konflik 2026-11-26 14.05)");
    expect(copy?.json).toBe("{mine}");
    expect(drive.files.get(fileId)!.json).toBe("{remote}");
    const st = engine.getState(meta.localId);
    expect(st.notice).toEqual({ type: "conflict", copyName: "Diagram (konflik 2026-11-26 14.05)", originalFileId: fileId });
    expect(st.status).toBe("synced");
    expect((await engine.getMeta(meta.localId)).fileId).toBe(copy!.id);
  });

  it("a document created offline is created on Drive exactly once, even with parallel syncs", async () => {
    const { drive, engine } = await setup({ online: false });
    const meta = await engine.createDriveDoc("New", "{n}");
    expect(meta.fileId).toBeNull();
    engine.setOnline(true);
    await Promise.all([engine.syncNow(meta.localId), engine.syncNow(meta.localId), engine.syncNow(meta.localId)]);
    await settle();
    expect(drive.calls.filter((c) => c === "create")).toHaveLength(1);
  });

  it("app closed while dirty: a fresh engine uploads the pending work on start", async () => {
    const a = await setup({ online: false });
    const meta = await a.engine.createDriveDoc("Crash", "{0}");
    await a.engine.saveLocal(meta.localId, "{unsaved}");
    const b = await setup({ dir: a.dir, drive: a.drive, online: true });
    await b.engine.syncAllDirty();
    await settle();
    expect(a.drive.byName("Crash")!.json).toBe("{unsaved}");
  });

  it("edits made during an upload are not lost: the doc stays pending and uploads again", async () => {
    const { drive, engine } = await setup();
    const meta = await engine.createDriveDoc("E", "{0}");
    await settle();
    let release!: () => void;
    drive.updateGate = new Promise((r) => (release = r));
    await engine.saveLocal(meta.localId, "{1}");
    await vi.advanceTimersByTimeAsync(2000);
    await until(() => engine.getState(meta.localId).status === "syncing" && drive.calls.includes("update"));
    await engine.saveLocal(meta.localId, "{2}");
    drive.updateGate = null;
    release();
    await settle();
    expect(engine.getState(meta.localId).status).toBe("pending");
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(drive.byName("E")!.json).toBe("{2}");
    expect(engine.getState(meta.localId).status).toBe("synced");
  });

  it("expired credentials: error state 'Perlu login ulang', work stays dirty, no auto retry", async () => {
    const { drive, engine, cache } = await setup();
    const meta = await engine.createDriveDoc("A", "{0}");
    await settle();
    await engine.saveLocal(meta.localId, "{1}");
    drive.failNext(new AuthRequiredError());
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    expect(engine.getState(meta.localId)).toMatchObject({ status: "error", error: "Perlu login ulang" });
    expect((await cache.getMeta(meta.localId)).dirty).toBe(true);
    const n = drive.calls.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(drive.calls.length).toBe(n);
  });

  it("a file deleted on Drive is recreated and reported", async () => {
    const { drive, engine } = await setup();
    const meta = await engine.createDriveDoc("Gone", "{0}");
    await settle();
    const fileId = (await engine.getMeta(meta.localId)).fileId!;
    await drive.trash(fileId);
    await engine.saveLocal(meta.localId, "{1}");
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    const recreated = [...drive.files.values()].find((f) => !f.trashed && f.json === "{1}");
    expect(recreated).toBeTruthy();
    expect(engine.getState(meta.localId).notice).toMatchObject({ type: "conflict", originalFileId: fileId });
  });

  describe("openDriveFile", () => {
    it("downloads when Drive is newer and the cache is clean", async () => {
      const { drive, engine } = await setup();
      const f = await drive.create("folder", "Shared", "{v1}");
      const first = await engine.openDriveFile(f.id);
      expect(first.json).toBe("{v1}");
      drive.externalEdit(f.id, "{v2}");
      const again = await engine.openDriveFile(f.id);
      expect(again.json).toBe("{v2}");
      expect(again.meta.localId).toBe(first.meta.localId);
    });
    it("uses the cache when versions match (no download)", async () => {
      const { drive, engine } = await setup();
      const f = await drive.create("folder", "Same", "{v1}");
      await engine.openDriveFile(f.id);
      drive.calls = [];
      await engine.openDriveFile(f.id);
      expect(drive.calls).toEqual(["getMeta"]);
    });
    it("Drive newer and cache dirty → conflict copy keeps local work", async () => {
      const { drive, engine } = await setup({ online: true });
      const f = await drive.create("folder", "Both", "{v1}");
      const { meta } = await engine.openDriveFile(f.id);
      engine.setOnline(false);
      await engine.saveLocal(meta.localId, "{local}");
      drive.externalEdit(f.id, "{remote}");
      engine.setOnline(true);
      const opened = await engine.openDriveFile(f.id);
      await settle();
      expect(opened.json).toBe("{local}");
      expect(drive.byName("Both (konflik 2026-11-26 14.05)")?.json).toBe("{local}");
      expect(drive.files.get(f.id)!.json).toBe("{remote}");
    });
    it("works offline from the cache, and explains when the file was never opened", async () => {
      const { drive, engine } = await setup();
      const f = await drive.create("folder", "Cached", "{c}");
      await engine.openDriveFile(f.id);
      engine.setOnline(false);
      expect((await engine.openDriveFile(f.id)).json).toBe("{c}");
      await expect(engine.openDriveFile("never-seen")).rejects.toThrow("File belum tersedia offline");
    });
  });

  it("dismissNotice clears the conflict notice", async () => {
    const { drive, engine } = await setup();
    const meta = await engine.createDriveDoc("N", "{0}");
    await settle();
    drive.externalEdit((await engine.getMeta(meta.localId)).fileId!, "{r}");
    await engine.saveLocal(meta.localId, "{m}");
    await vi.advanceTimersByTimeAsync(2000);
    await settle();
    engine.dismissNotice(meta.localId);
    expect(engine.getState(meta.localId).notice).toBeNull();
  });
});
