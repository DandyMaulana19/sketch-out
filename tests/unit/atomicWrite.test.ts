import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWriteFile } from "../../src/main/services/atomicWrite";

const tmp = () => mkdtemp(join(tmpdir(), "so-aw-"));

describe("atomicWriteFile", () => {
  afterEach(() => vi.restoreAllMocks());
  it("writes content and leaves no temp files", async () => {
    const dir = await tmp();
    const f = join(dir, "a.excalidraw");
    await atomicWriteFile(f, "hello");
    expect(await readFile(f, "utf8")).toBe("hello");
    expect((await readdir(dir)).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });
  it("keeps the old file intact and cleans up when rename fails", async () => {
    const dir = await tmp();
    const f = join(dir, "a.excalidraw");
    await writeFile(f, "old");
    const io = { rename: vi.fn().mockRejectedValue(new Error("boom")) };
    await expect(atomicWriteFile(f, "new", io)).rejects.toThrow("boom");
    expect(await readFile(f, "utf8")).toBe("old");
    expect((await readdir(dir)).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });
});
