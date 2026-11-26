import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import { z } from "zod";
import { handle } from "../ipc/register";
import { getAppStore } from "../services/appStores";
import { findFolderWindowFor, openDocument, registry } from "../windows";
import { openFolder } from "../ipc/folderHandlers";
import type { AiOp, AiRouter } from "./tools";

const TIMEOUT_MS = 20_000;
const pending = new Map<string, { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>();

function whenLoaded(win: BrowserWindow): Promise<void> {
  if (!win.webContents.isLoading()) return Promise.resolve();
  return new Promise((r) => win.webContents.once("did-finish-load", () => r()));
}

/** The window that shows (or should show) a note: its own window, its folder's window, a recent folder, or a new window. */
async function windowFor(path: string): Promise<BrowserWindow> {
  const shown = registry.find({ kind: "local", path });
  if (shown) return shown;
  const folderWin = findFolderWindowFor(path);
  if (folderWin) return folderWin;
  const recent = getAppStore()
    .get()
    .recentFolders.filter((d) => path.startsWith(`${d}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (recent) return openFolder(recent);
  return openDocument({ kind: "local", path });
}

export function createRouter(): AiRouter {
  handle("ai:respond", z.object({ id: z.string().max(100), result: z.unknown().optional(), error: z.string().max(2000).optional() }), ({ id, result, error }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (error !== undefined) p.reject(new Error(error));
    else p.resolve(result);
  });

  return {
    isOpen: (path) => !!registry.find({ kind: "local", path }),
    async request<T>(path: string, op: AiOp, args?: unknown): Promise<T> {
      const win = await windowFor(path);
      await whenLoaded(win);
      if (win.isMinimized()) win.restore();
      const id = randomUUID();
      const result = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("Sketch Out tidak merespons"));
        }, TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
      });
      win.webContents.send("ai:request", { id, path, op, args: args ?? {} });
      return (await result) as T;
    },
  };
}
