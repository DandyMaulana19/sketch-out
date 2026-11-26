import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CacheStore } from "../../src/main/services/cache/cacheStore";

const root = () => mkdtemp(join(tmpdir(), "so-cache-"));

describe("CacheStore", () => {
  it("creates an entry and marks it dirty on writeDoc", async () => {
    const c = new CacheStore(await root());
    const m = await c.create({ fileId: "f1", name: "A", json: "{0}", baseVersion: "3", dirty: false });
    expect(m.localId).toMatch(/^[0-9a-f-]{36}$/);
    await c.writeDoc(m.localId, "{1}");
    expect(await c.readDoc(m.localId)).toBe("{1}");
    expect((await c.getMeta(m.localId)).dirty).toBe(true);
  });

  it("finds entries by fileId after a restart", async () => {
    const dir = await root();
    const m = await new CacheStore(dir).create({ fileId: "f9", name: "B", json: "{}", baseVersion: "1", dirty: false });
    const again = new CacheStore(dir);
    expect((await again.findByFileId("f9"))?.localId).toBe(m.localId);
    expect(await again.findByFileId("nope")).toBeNull();
  });

  it("lists only dirty entries", async () => {
    const c = new CacheStore(await root());
    const a = await c.create({ fileId: "a", name: "A", json: "{}", baseVersion: "1", dirty: false });
    const b = await c.create({ fileId: null, name: "B", json: "{}", baseVersion: null, dirty: true });
    await c.updateMeta(a.localId, { name: "A2" });
    expect((await c.listDirty()).map((m) => m.localId)).toEqual([b.localId]);
  });

  it("skips entries with corrupt meta.json instead of throwing", async () => {
    const dir = await root();
    const c = new CacheStore(dir);
    const ok = await c.create({ fileId: null, name: "ok", json: "{}", baseVersion: null, dirty: true });
    const bad = await c.create({ fileId: null, name: "bad", json: "{}", baseVersion: null, dirty: true });
    await writeFile(join(dir, bad.localId, "meta.json"), "{broken");
    const fresh = new CacheStore(dir);
    expect((await fresh.listDirty()).map((m) => m.localId)).toEqual([ok.localId]);
  });

  it("increments the local revision monotonically on every write", async () => {
    const c = new CacheStore(await root());
    const m = await c.create({ fileId: null, name: "r", json: "{}", baseVersion: null, dirty: false });
    const r1 = await c.writeDoc(m.localId, "{1}");
    const r2 = await c.writeDoc(m.localId, "{2}");
    expect(r2).toBeGreaterThan(r1);
    expect(c.revision(m.localId)).toBe(r2);
  });

  it("rejects localIds that could escape the cache folder", async () => {
    const c = new CacheStore(await root());
    await expect(c.readDoc("../../etc")).rejects.toThrow("Invalid localId");
  });
});
