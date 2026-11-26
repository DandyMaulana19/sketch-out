import { app, BrowserWindow, session } from "electron";
import { createDocumentWindow } from "./windows";
import { CSP } from "./security";

app.enableSandbox();

app.whenReady().then(() => {
  if (!process.env.ELECTRON_RENDERER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [CSP] } });
    });
  }
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(permission === "clipboard-read" || permission === "clipboard-sanitized-write"),
  );
  createDocumentWindow(null);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createDocumentWindow(null);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
