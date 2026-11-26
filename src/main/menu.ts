import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import type { MenuCommand } from "../preload/api";
import { createDocumentWindow, sendCommand } from "./windows";

function toFocused(cmd: MenuCommand) {
  return () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) sendCommand(win, cmd);
  };
}

export function installMenu(): void {
  const isMac = process.platform === "darwin";
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        { label: "Baru", accelerator: "CmdOrCtrl+N", click: () => createDocumentWindow(null) },
        { label: "Buka…", accelerator: "CmdOrCtrl+O", click: toFocused("open") },
        { type: "separator" },
        { label: "Simpan", accelerator: "CmdOrCtrl+S", click: toFocused("save") },
        { label: "Simpan sebagai…", accelerator: "CmdOrCtrl+Shift+S", click: toFocused("saveAs") },
        { type: "separator" },
        { role: "close", label: "Tutup" },
        ...(isMac ? [] : [{ role: "quit" as const }]),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ type: "separator" as const }, { role: "reload" as const }, { role: "toggleDevTools" as const }]),
      ],
    },
    { role: "windowMenu" },
    { role: "help", submenu: [] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
