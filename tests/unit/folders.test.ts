import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNote, listNotes, renameNote, validNoteName, watchFolder } from "../../src/main/services/folders";

const tmp = () => mkdtemp(join(tmpdir(), "so-fold-"));
async function touch(dir: string, rel: string) {
  const p = join(dir, rel);
  await mkdir(join(p, ".."), { recursive: true });
  await writeFile(p, "{}");
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("listNotes", () => {
  it("finds .excalidraw files in subfolders and skips hidden, node_modules, other files and too-deep files", async () => {
    const d = await tmp();
    for (const rel of [
      "catatan 10.excalidraw",
      "catatan 2.excalidraw",
      "a.txt",
      ".hidden.excalidraw",
      "sub/c.excalidraw",
      "a/b/d.excalidraw",
      ".git/x.excalidraw",
      "node_modules/y.excalidraw",
      "kosong/catatan.txt",
      "1/2/3/4/5/6/7/8/ok.excalidraw",
      "1/2/3/4/5/6/7/8/9/deep.excalidraw",
    ])
      await touch(d, rel);
    const notes = await listNotes(d);
    expect(notes.map((n) => n.rel)).toEqual([
      "1/2/3/4/5/6/7/8/ok.excalidraw",
      "a/b/d.excalidraw",
      "catatan 2.excalidraw",
      "catatan 10.excalidraw",
      "sub/c.excalidraw",
    ]);
    const c = notes.find((n) => n.rel === "sub/c.excalidraw")!;
    expect(c.name).toBe("c");
    expect(c.path).toBe(join(d, "sub/c.excalidraw"));
    expect(c.mtimeMs).toBeGreaterThan(0);
  });

  it("stops after the file limit", async () => {
    const d = await tmp();
    for (let i = 0; i < 6; i++) await touch(d, `n${i}.excalidraw`);
    expect(await listNotes(d, { maxFiles: 4 })).toHaveLength(4);
  });
});

describe("note names", () => {
  it("rejects empty names, separators and leading dots", () => {
    expect(() => validNoteName("a/b")).toThrow("Nama tidak valid");
    expect(() => validNoteName("a\\b")).toThrow("Nama tidak valid");
    expect(() => validNoteName("   ")).toThrow("Nama tidak valid");
    expect(() => validNoteName(".x")).toThrow("Nama tidak valid");
    expect(validNoteName("  Ide  ")).toBe("Ide");
  });

  it("createNote adds a numeric suffix when the name is taken", async () => {
    const d = await tmp();
    const a = await createNote(d, "Ide", "{\"a\":1}");
    const b = await createNote(d, "Ide", "{}");
    expect(a).toBe(join(d, "Ide.excalidraw"));
    expect(b).toBe(join(d, "Ide 2.excalidraw"));
    expect(await readFile(a, "utf8")).toBe("{\"a\":1}");
  });

  it("renameNote keeps the same path for the same name and avoids collisions", async () => {
    const d = await tmp();
    const a = await createNote(d, "A", "{}");
    await createNote(d, "B", "{}");
    expect(await renameNote(a, "A")).toBe(a);
    const moved = await renameNote(a, "B");
    expect(moved).toBe(join(d, "B 2.excalidraw"));
  });

  it("renameNote stays in the note's own subfolder", async () => {
    const d = await tmp();
    await mkdir(join(d, "riset"));
    const a = await createNote(join(d, "riset"), "ide", "{}");
    expect(await renameNote(a, "gagasan")).toBe(join(d, "riset", "gagasan.excalidraw"));
  });
});

describe("watchFolder", () => {
  it("debounces bursts of changes, including in subfolders", async () => {
    const d = await tmp();
    await mkdir(join(d, "sub"));
    let calls = 0;
    const stop = watchFolder(d, () => calls++, 150);
    await wait(100);
    await touch(d, "a.excalidraw");
    await touch(d, "b.excalidraw");
    await touch(d, "sub/c.excalidraw");
    await wait(600);
    stop();
    expect(calls).toBe(1);
  });
});
