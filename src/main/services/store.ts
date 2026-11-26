import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { atomicWriteFile } from "./atomicWrite";

export interface JsonStore<T> {
  get(): T;
  set(patch: Partial<T>): Promise<void>;
}

export function createJsonStore<T extends object>(file: string, defaults: T): JsonStore<T> {
  let state: T = { ...defaults };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed && typeof parsed === "object") state = { ...defaults, ...parsed };
  } catch {
    /* missing or corrupt → defaults */
  }
  let queue: Promise<void> = Promise.resolve();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      const snapshot = JSON.stringify(state);
      queue = queue.then(async () => {
        await mkdir(dirname(file), { recursive: true });
        await atomicWriteFile(file, snapshot);
      });
      return queue;
    },
  };
}

export const RECENT_LIMIT = 10;
export function addRecent(list: string[], path: string): string[] {
  return [path, ...list.filter((p) => p !== path)].slice(0, RECENT_LIMIT);
}
