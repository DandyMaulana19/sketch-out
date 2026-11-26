import type { AiOp, AiRequest } from "../../preload/api";

/** Runs one AI operation on the canvas showing a note. */
export type DocHandler = (op: AiOp, args: Record<string, unknown>) => Promise<unknown>;

const api = window.sketchOut;
const handlers = new Map<string, DocHandler>();
const waiters = new Map<string, ((h: DocHandler) => void)[]>();
let folderOpener: ((path: string) => Promise<void>) | null = null;
const OPEN_WAIT_MS = 10_000;

/** Called by the editor for the note it shows, once the canvas is ready. */
export function registerDocHandler(path: string, h: DocHandler): () => void {
  handlers.set(path, h);
  for (const w of waiters.get(path) ?? []) w(h);
  waiters.delete(path);
  return () => {
    if (handlers.get(path) === h) handlers.delete(path);
  };
}

/** Folder windows: how to bring a note into view (open its tab) when the AI asks for it. */
export function setFolderOpener(fn: (path: string) => Promise<void>): () => void {
  folderOpener = fn;
  return () => {
    if (folderOpener === fn) folderOpener = null;
  };
}

function waitForHandler(path: string): Promise<DocHandler> {
  const ready = handlers.get(path);
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Catatan tidak bisa dibuka di Sketch Out")), OPEN_WAIT_MS);
    const list = waiters.get(path) ?? [];
    list.push((h) => {
      clearTimeout(timer);
      resolve(h);
    });
    waiters.set(path, list);
  });
}

let installed = false;
/** Answer MCP tool calls that main forwards to this window. */
export function installAiHost(): void {
  if (installed) return;
  installed = true;
  api.on("ai:request", async (payload) => {
    const { id, path, op, args } = payload as AiRequest;
    try {
      if (!handlers.has(path) && folderOpener) await folderOpener(path);
      const h = await waitForHandler(path);
      const result = await h(op, (args ?? {}) as Record<string, unknown>);
      await api.ai.respond({ id, result });
    } catch (e) {
      await api.ai.respond({ id, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
