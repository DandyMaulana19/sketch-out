import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLocalFile, writeLocalFile, statMtime, LocalFileMissingError } from "../../src/main/services/localFiles";

const scene = JSON.stringify({ type: "excalidraw", version: 2, source: "t", elements: [], appState: {}, files: {} });

describe("localFiles", () => {
  it("round-trips a scene and reports mtime", async () => {
    const dir = await mkdtemp(join(tmpdir(), "so-lf-"));
    const f = join(dir, "x.excalidraw");
    const { mtimeMs } = await writeLocalFile(f, scene);
    const r = await readLocalFile(f);
    expect(r.json).toBe(scene);
    expect(r.mtimeMs).toBe(mtimeMs);
    expect(await statMtime(f)).toBe(mtimeMs);
  });
  it("rejects files that are not Excalidraw scenes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "so-lf-"));
    const f = join(dir, "x.excalidraw");
    await writeFile(f, JSON.stringify({ hello: 1 }));
    await expect(readLocalFile(f)).rejects.toThrow("Bukan file Excalidraw");
  });
  it("statMtime returns null for missing files", async () => {
    expect(await statMtime("/nonexistent/zzz.excalidraw")).toBeNull();
  });
  it("throws LocalFileMissingError when the folder disappeared", async () => {
    const dir = await mkdtemp(join(tmpdir(), "so-lf-"));
    await rm(dir, { recursive: true });
    await expect(writeLocalFile(join(dir, "x.excalidraw"), scene)).rejects.toBeInstanceOf(LocalFileMissingError);
  });
});
