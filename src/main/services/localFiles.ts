import { readFile, stat } from "node:fs/promises";
import type { SceneJSON } from "@shared/types";
import { atomicWriteFile } from "./atomicWrite";

export class LocalFileMissingError extends Error {
  constructor(path: string) {
    super(`File tidak ditemukan: ${path}`);
    this.name = "LocalFileMissingError";
  }
}

export function assertExcalidrawJson(json: string): void {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Bukan file Excalidraw (JSON tidak valid)");
  }
  if (!data || typeof data !== "object" || (data as { type?: unknown }).type !== "excalidraw") {
    throw new Error("Bukan file Excalidraw");
  }
}

export async function readLocalFile(path: string): Promise<{ json: SceneJSON; mtimeMs: number }> {
  const json = await readFile(path, "utf8");
  assertExcalidrawJson(json);
  const s = await stat(path);
  return { json, mtimeMs: s.mtimeMs };
}

export async function writeLocalFile(path: string, json: SceneJSON): Promise<{ mtimeMs: number }> {
  try {
    await atomicWriteFile(path, json);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") throw new LocalFileMissingError(path);
    throw err;
  }
  return { mtimeMs: (await stat(path)).mtimeMs };
}

export async function statMtime(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}
