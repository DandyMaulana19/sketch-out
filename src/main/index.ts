import { join } from "node:path";
import { app, BrowserWindow, session } from "electron";
import { createDocumentWindow, setRecoveryDiscarder } from "./windows";
import { CSP } from "./security";
import { installMenu } from "./menu";
import { registerAppHandlers, registerAuthHandlers, registerFileHandlers } from "./ipc/handlers";
import { RecoveryStore } from "./services/recovery";
import { handleProtocolUrl } from "./library";

if (process.env.SKETCHOUT_USER_DATA) app.setPath("userData", process.env.SKETCHOUT_USER_DATA);
app.enableSandbox();

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

if (!process.env.E2E) {
  if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient("sketchout", process.execPath, [process.argv[1]]);
  else app.setAsDefaultProtocolClient("sketchout");
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  void app.whenReady().then(() => handleProtocolUrl(url));
});
app.on("second-instance", (_e, argv) => {
  const url = argv.find((a) => a.startsWith("sketchout://"));
  if (url) void handleProtocolUrl(url);
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
  installMenu();

  const leftovers = (await recovery.list()).slice(0, MAX_RECOVERED_WINDOWS);
  if (leftovers.length) for (const id of leftovers) createDocumentWindow(null, { recoveryId: id, recovered: true });
  else createDocumentWindow(null);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createDocumentWindow(null);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
