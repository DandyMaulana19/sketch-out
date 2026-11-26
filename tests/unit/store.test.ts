import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJsonStore, addRecent } from "../../src/main/services/store";

describe("json store", () => {
  it("persists patches across instances", async () => {
    const f = join(await mkdtemp(join(tmpdir(), "so-st-")), "s.json");
    const a = createJsonStore(f, { n: 0, s: "x" });
    await a.set({ n: 5 });
    const b = createJsonStore(f, { n: 0, s: "x" });
    expect(b.get()).toEqual({ n: 5, s: "x" });
  });
  it("falls back to defaults when the file is corrupt", async () => {
    const f = join(await mkdtemp(join(tmpdir(), "so-st-")), "s.json");
    await writeFile(f, "{not json");
    expect(createJsonStore(f, { n: 1 }).get()).toEqual({ n: 1 });
  });
});

describe("addRecent", () => {
  it("dedupes, puts newest first, caps at 10", () => {
    let r: string[] = [];
    for (let i = 0; i < 12; i++) r = addRecent(r, `/f${i}`);
    r = addRecent(r, "/f5");
    expect(r[0]).toBe("/f5");
    expect(r).toHaveLength(10);
    expect(new Set(r).size).toBe(10);
  });
});
