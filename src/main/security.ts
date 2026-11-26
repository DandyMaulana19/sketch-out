import { shell, type WebContents, type WebPreferences } from "electron";

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "frame-src https:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    spellcheck: false,
  };
}

/** True when the URL belongs to our own renderer (packaged file:// or the dev server). */
export function isAppUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const dev = process.env.ELECTRON_RENDERER_URL;
    if (dev && u.origin === new URL(dev).origin) return true;
    return u.protocol === "file:" && u.pathname.endsWith("/renderer/index.html");
  } catch {
    return false;
  }
}

function openExternalSafely(url: string): void {
  try {
    if (new URL(url).protocol === "https:") void shell.openExternal(url);
  } catch {
    /* ignore malformed */
  }
}

export function installNavigationGuards(contents: WebContents): void {
  contents.on("will-navigate", (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      openExternalSafely(url);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
}
