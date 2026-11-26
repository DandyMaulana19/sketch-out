import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { app, BrowserWindow, dialog, type WebContents } from "electron";
import type { DocRef } from "@shared/types";
import type { DocState, InitialDoc, MenuCommand } from "../preload/api";
import { installNavigationGuards, secureWebPreferences } from "./security";

interface WinInfo {
  initial: InitialDoc;
  state: DocState | null;
  forceClose: boolean;
}

const infos = new Map<number, WinInfo>();
let quitting = false;
let onDiscardRecovery: (recoveryId: string) => Promise<void> = async () => {};

app.on("before-quit", () => {
  quitting = true;
});

export function setRecoveryDiscarder(fn: (recoveryId: string) => Promise<void>): void {
  onDiscardRecovery = fn;
}

export function sendCommand(win: BrowserWindow, cmd: MenuCommand): void {
  win.webContents.send("menu:command", cmd);
}

export function infoFor(contents: WebContents): WinInfo {
  const i = infos.get(contents.id);
  if (!i) throw new Error("Unknown window");
  return i;
}

export function createDocumentWindow(doc: DocRef | null, opts: { recoveryId?: string; recovered?: boolean } = {}): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: "Sketch Out",
    webPreferences: secureWebPreferences(join(__dirname, "../preload/index.cjs")),
  });
  const id = win.webContents.id;
  const needsRecovery = !doc || (doc.kind === "local" && !doc.path);
  infos.set(id, {
    initial: {
      doc: doc ?? { kind: "local", path: null },
      recoveryId: needsRecovery ? (opts.recoveryId ?? randomUUID()) : null,
      recovered: !!opts.recovered,
    },
    state: null,
    forceClose: false,
  });
  installNavigationGuards(win.webContents);
  win.once("ready-to-show", () => win.show());
  win.on("close", (e) => handleClose(win, e));
  win.on("closed", () => infos.delete(id));
  const dev = process.env.ELECTRON_RENDERER_URL;
  const query = process.env.E2E ? { e2e: "1" } : undefined;
  if (dev) void win.loadURL(query ? `${dev}?e2e=1` : dev);
  else void win.loadFile(join(__dirname, "../renderer/index.html"), { query });
  return win;
}

/** Close the window without asking again (renderer already saved or the user chose to discard). */
export function forceClose(win: BrowserWindow): void {
  const i = infos.get(win.webContents.id);
  if (i) i.forceClose = true;
  win.close();
  if (quitting) setImmediate(() => app.quit());
}

function handleClose(win: BrowserWindow, e: Electron.Event): void {
  const i = infos.get(win.webContents.id);
  if (!i || i.forceClose || !i.state) return;
  const st = i.state;
  if (st.untitled && st.nonEmpty) {
    e.preventDefault();
    void dialog
      .showMessageBox(win, {
        type: "warning",
        buttons: ["Simpan…", "Jangan simpan", "Batal"],
        defaultId: 0,
        cancelId: 2,
        message: "Simpan gambar ini sebelum menutup?",
        detail: "Gambar ini belum pernah disimpan ke file.",
      })
      .then(async ({ response }) => {
        if (response === 0) sendCommand(win, "saveAsThenClose");
        else if (response === 1) {
          if (st.recoveryId) await onDiscardRecovery(st.recoveryId);
          forceClose(win);
        } else quitting = false;
      });
  } else if (st.edited) {
    e.preventDefault();
    sendCommand(win, "flushThenClose");
    // Never trap the user: close anyway if the renderer does not answer.
    setTimeout(() => !win.isDestroyed() && forceClose(win), 5000);
  }
}
