import { BrowserWindow, net } from "electron";
import { parseAddLibraryUrl } from "./services/libraryUrl";

const MAX_LIBRARY_BYTES = 20 * 1024 * 1024;

/** Handle sketchout://addLibrary#addLibrary=… sent back by libraries.excalidraw.com. */
export async function handleProtocolUrl(url: string): Promise<void> {
  const lib = parseAddLibraryUrl(url);
  if (!lib) return;
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!win) return;
  try {
    const res = await net.fetch(lib);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_LIBRARY_BYTES) throw new Error("Library terlalu besar");
    JSON.parse(text);
    win.webContents.send("library:add", { ok: true, json: text });
  } catch (err) {
    win.webContents.send("library:add", { ok: false, error: String((err as Error).message ?? err) });
  }
  if (win.isMinimized()) win.restore();
  win.focus();
}
