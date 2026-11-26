/**
 * Path helpers that work in both the main and renderer processes (the renderer has no `node:path`).
 * A Windows path is recognised by its shape (`C:\…`, `C:/…` or `\\server\…`), so the renderer does not need the platform.
 */
const WIN_ABS = /^(?:[A-Za-z]:[\\/]|\\\\)/;

export const isWindowsPath = (p: string): boolean => WIN_ABS.test(p);

/** The separator native to `p`'s platform. */
export const sepOf = (p: string): "\\" | "/" => (isWindowsPath(p) ? "\\" : "/");

/** `folder` joined with a "/"-separated relative path, using `folder`'s own separator. */
export function joinRel(folder: string, rel: string): string {
  const sep = sepOf(folder);
  const tail = sep === "\\" ? rel.replace(/\//g, "\\") : rel;
  return folder.endsWith(sep) ? folder + tail : folder + sep + tail;
}

/** `p` relative to `folder` with "/" separators, or null when `p` is not inside `folder`. */
export function relTo(folder: string, p: string): string | null {
  if (!isInside(p, folder)) return null;
  const base = folder.replace(/[\\/]+$/, "");
  const rest = p.slice(base.length + 1);
  return isWindowsPath(folder) ? rest.replace(/\\/g, "/") : rest;
}

/**
 * True when `p` lies strictly inside `dir`. Windows paths compare case-insensitively and accept
 * either separator; POSIX paths compare exactly.
 */
export function isInside(p: string, dir: string): boolean {
  if (isWindowsPath(dir)) {
    const norm = (s: string) => s.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
    const d = norm(dir);
    const q = p.replace(/\//g, "\\").toLowerCase();
    return q.length > d.length + 1 && q.startsWith(`${d}\\`);
  }
  const d = dir.replace(/\/+$/, "");
  return p.length > d.length + 1 && p.startsWith(`${d}/`);
}

/** A map key for a path: Windows paths fold case and separators (NTFS is case-insensitive); POSIX paths stay as they are. */
export const pathKey = (p: string): string => (isWindowsPath(p) ? p.replace(/\//g, "\\").toLowerCase() : p);

/** A shortcut label for menus: "⌘⇧O" on macOS, "Ctrl+Shift+O" elsewhere. `keys` uses "Mod" and "Shift", e.g. "Mod+Shift+O". */
export function shortcutLabel(keys: string, mac: boolean): string {
  if (mac) return keys.replace("Mod+", "⌘").replace("Shift+", "⇧");
  return keys.replace("Mod+", "Ctrl+");
}
