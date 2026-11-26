import { join } from "node:path";
import { BrowserWindow } from "electron";
import type { DocRef } from "@shared/types";
import { installNavigationGuards, secureWebPreferences } from "./security";

export function createDocumentWindow(_doc: DocRef | null): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 480,
    show: false,
    title: "Sketch Out",
    webPreferences: secureWebPreferences(join(__dirname, "../preload/index.cjs")),
  });
  installNavigationGuards(win.webContents);
  win.once("ready-to-show", () => win.show());
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) void win.loadURL(dev);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));
  return win;
}
