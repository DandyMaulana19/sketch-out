import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import type { MenuCommand } from "../preload/api";
import { createDocumentWindow, isFolderWindow, sendCommand } from "./windows";
import { openFolderFromDialog } from "./ipc/folderHandlers";

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
        { label: "Buka folder…", accelerator: "CmdOrCtrl+Shift+O", click: () => void openFolderFromDialog(BrowserWindow.getFocusedWindow()) },
        { type: "separator" },
        { label: "Simpan", accelerator: "CmdOrCtrl+S", click: toFocused("save") },
        { label: "Simpan sebagai…", accelerator: "CmdOrCtrl+Shift+S", click: toFocused("saveAs") },
        { type: "separator" },
        {
          label: "Tutup",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win) return;
            if (isFolderWindow(win)) sendCommand(win, "closeTab");
            else win.close();
          },
        },
        ...(isMac ? [] : [{ role: "quit" as const }]),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Tab berikutnya", accelerator: "Ctrl+Tab", click: toFocused("nextTab") },
        { label: "Tab sebelumnya", accelerator: "Ctrl+Shift+Tab", click: toFocused("prevTab") },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ type: "separator" as const }, { role: "reload" as const }, { role: "toggleDevTools" as const }]),
      ],
    },
    { role: "windowMenu" },
    { role: "help", submenu: [] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
