import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { app, BrowserWindow, net, session } from "electron";
import { broadcast, createDocumentWindow, openDocument, setRecoveryDiscarder } from "./windows";
import { grantPath } from "./services/grants";
import { CSP } from "./security";
import { installMenu } from "./menu";
import { registerAppHandlers, registerAuthHandlers, registerFileHandlers } from "./ipc/handlers";
import { RecoveryStore } from "./services/recovery";
import { handleProtocolUrl } from "./library";
import { registerDriveHandlers } from "./ipc/driveHandlers";
import { openFolder, registerFolderHandlers } from "./ipc/folderHandlers";
import { getSync } from "./services/drive/instance";
import { createConnectivity } from "./services/connectivity";
import { getAuth } from "./services/auth/instance";


/** The normal app: windows, menus, IPC. (`index.ts` runs the MCP bridge instead when started with --mcp.) */
export function startApp(): void {
  app.enableSandbox();

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
  }

  if (!process.env.E2E) {
    if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient("sketchout", process.execPath, [process.argv[1]]);
    else app.setAsDefaultProtocolClient("sketchout");
  }

  const isDocArg = (a: string) => /\.excalidraw$/i.test(a) && !a.startsWith("-");
  const docArgs = (argv: string[]) => argv.slice(process.defaultApp ? 2 : 1).filter(isDocArg);
  const isDir = (p: string) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  // In development the app's own directory is on the command line too; it is not a folder to open.
  const folderArgs = (argv: string[]) =>
    argv.slice(1).filter((a) => !a.startsWith("-") && resolve(a) !== app.getAppPath() && isDir(a));
  let ready = false;
  const pendingFiles: string[] = [];
  const pendingFolders: string[] = [];
  function openFolderPath(p: string): void {
    if (ready) void openFolder(p).catch(() => {});
    else pendingFolders.push(p);
  }
  function openFile(p: string): void {
    if (isDir(p)) return openFolderPath(p);
    const path = grantPath(p);
    if (ready) openDocument({ kind: "local", path });
    else pendingFiles.push(path);
  }

  // macOS Finder / Dock: may fire before "ready".
  app.on("open-file", (event, path) => {
    event.preventDefault();
    openFile(path);
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    void app.whenReady().then(() => handleProtocolUrl(url));
  });
  app.on("second-instance", (_e, argv) => {
    const url = argv.find((a) => a.startsWith("sketchout://"));
    if (url) void handleProtocolUrl(url);
    const files = docArgs(argv);
    const folders = folderArgs(argv);
    for (const f of files) openFile(f);
    for (const d of folders) openFolderPath(d);
    if (!url && !files.length && !folders.length) BrowserWindow.getAllWindows()[0]?.focus();
  });

  const MAX_RECOVERED_WINDOWS = 5;

  app.whenReady().then(async () => {
    if (!process.env.ELECTRON_RENDERER_URL) {
      session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
        cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] } });
      });
    }
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
      cb(permission === "clipboard-read" || permission === "clipboard-sanitized-write"),
    );

    const recovery = new RecoveryStore(join(app.getPath("userData"), "recovery"));
    setRecoveryDiscarder((id) => recovery.clear(id));
    registerFileHandlers(recovery);
    registerAppHandlers();
    registerAuthHandlers();
    registerFolderHandlers();

    const sync = getSync();
    sync.on("state", (st) => broadcast("sync:state", st));
    const connectivity = createConnectivity({ isOnline: () => net.isOnline(), onChange: (o) => sync.setOnline(o) });
    registerDriveHandlers(connectivity);
    if ((await getAuth().status()).signedIn) void sync.syncAllDirty();
    installMenu();

    ready = true;
    for (const f of docArgs(process.argv)) pendingFiles.push(grantPath(f));
    const leftovers = (await recovery.list()).slice(0, MAX_RECOVERED_WINDOWS);
    for (const id of leftovers) createDocumentWindow(null, { recoveryId: id, recovered: true });
    for (const f of pendingFiles.splice(0)) openDocument({ kind: "local", path: f });
    for (const d of [...pendingFolders.splice(0), ...folderArgs(process.argv)]) await openFolder(d).catch(() => {});
    if (BrowserWindow.getAllWindows().length === 0) createDocumentWindow(null);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createDocumentWindow(null);
    });
  });

  // Give pending Drive uploads a last chance (max 5 s); anything left stays in the cache for next launch.
  let flushedBeforeQuit = false;
  app.on("will-quit", (e) => {
    if (flushedBeforeQuit) return;
    flushedBeforeQuit = true;
    e.preventDefault();
    const sync = getSync();
    void Promise.race([sync.syncAllDirty().then(() => sync.whenIdle()), new Promise((r) => setTimeout(r, 5000))]).finally(() => app.quit());
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
