import { join } from "node:path";
import { app, BrowserWindow, session } from "electron";
import { createDocumentWindow, setRecoveryDiscarder } from "./windows";
import { CSP } from "./security";
import { installMenu } from "./menu";
import { registerAppHandlers, registerFileHandlers } from "./ipc/handlers";
import { RecoveryStore } from "./services/recovery";

if (process.env.SKETCHOUT_USER_DATA) app.setPath("userData", process.env.SKETCHOUT_USER_DATA);
app.enableSandbox();

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
