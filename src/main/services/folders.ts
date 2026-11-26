import { watch } from "node:fs";
import { access, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import type { NoteInfo } from "@shared/types";

const EXT = ".excalidraw";
export const MAX_DEPTH = 8;
export const MAX_FILES = 5000;

const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });
const skipDir = (name: string) => name.startsWith(".") || name === "node_modules";

/** Every .excalidraw note under `root` (subfolders up to MAX_DEPTH deep), sorted by relative path. */
export async function listNotes(root: string, opts: { maxDepth?: number; maxFiles?: number } = {}): Promise<NoteInfo[]> {
  const maxDepth = opts.maxDepth ?? MAX_DEPTH;
  const maxFiles = opts.maxFiles ?? MAX_FILES;
  const found: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable subfolder: skip it
    }
    for (const e of entries) {
      if (found.length >= maxFiles) return;
      if (e.isDirectory()) {
        if (!skipDir(e.name) && depth < maxDepth) await walk(join(dir, e.name), depth + 1);
      } else if (e.isFile() && !e.name.startsWith(".") && e.name.toLowerCase().endsWith(EXT)) {
        found.push(join(dir, e.name));
      }
    }
  }
  await walk(root, 0);
  const notes = await Promise.all(
    found.map(async (path): Promise<NoteInfo | null> => {
      try {
        const s = await stat(path);
        return { name: basename(path).slice(0, -EXT.length), path, rel: relative(root, path).split(sep).join("/"), mtimeMs: s.mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  return notes.filter((n): n is NoteInfo => !!n).sort((a, b) => collator.compare(a.rel, b.rel));
}

export function validNoteName(name: string): string {
  const n = name.trim();
  if (!n || /[\\/]/.test(n) || n.startsWith(".") || n.length > 200) throw new Error("Nama tidak valid");
  return n;
}

const exists = (p: string) => access(p).then(() => true, () => false);

/** `<name>.excalidraw`, or `<name> 2.excalidraw`, `<name> 3…` when taken. `except` may be reused (renaming to itself). */
export async function uniqueNotePath(dir: string, name: string, except?: string): Promise<string> {
  for (let i = 1; ; i++) {
    const p = join(dir, `${i === 1 ? name : `${name} ${i}`}${EXT}`);
    if (p === except || !(await exists(p))) return p;
  }
}

export async function createNote(dir: string, name: string, json: string): Promise<string> {
  const n = validNoteName(name);
  for (;;) {
    const p = await uniqueNotePath(dir, n);
    try {
      await writeFile(p, json, { encoding: "utf8", flag: "wx" });
      return p;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e; // lost a race: try the next number
    }
  }
}

export async function renameNote(path: string, name: string): Promise<string> {
  const target = await uniqueNotePath(dirname(path), validNoteName(name), path);
  if (target !== path) await rename(path, target);
  return target;
}

/** Calls `onChange` once per burst of changes anywhere under `dir`. Returns a stop function. */
export function watchFolder(dir: string, onChange: () => void, debounceMs = 300): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let w: ReturnType<typeof watch> | null = null;
  try {
    w = watch(dir, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onChange();
      }, debounceMs);
    });
    w.on("error", () => {});
  } catch {
    /* folder vanished: nothing to watch */
  }
  return () => {
    if (timer) clearTimeout(timer);
    w?.close();
  };
}
