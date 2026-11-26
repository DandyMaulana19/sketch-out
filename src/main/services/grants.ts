import { realpathSync } from "node:fs";
import { extname, relative, resolve, isAbsolute } from "node:path";

/** Paths the user explicitly chose (dialogs, Finder, recent list). The renderer may only touch these. */
const granted = new Set<string>();
/** Folders the user opened: every .excalidraw file inside them (any depth) is allowed. */
const grantedFolders = new Set<string>();

export function grantPath(p: string): string {
  const abs = resolve(p);
  granted.add(abs);
  return abs;
}

export function grantFolder(dir: string): string {
  const abs = resolve(dir);
  grantedFolders.add(abs);
  return abs;
}

const isInside = (child: string, parent: string) => {
  const r = relative(parent, child);
  return r !== "" && !r.startsWith("..") && !isAbsolute(r);
};

const real = (p: string): string | null => {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
};

function folderOf(abs: string, allowSelf: boolean): string | null {
  for (const f of grantedFolders) if ((allowSelf && abs === f) || isInside(abs, f)) return f;
  return null;
}

/** A symlink inside the folder must not lead outside it. */
function staysInside(abs: string, folder: string, allowSelf: boolean): boolean {
  const r = real(abs);
  if (r === null) return true; // does not exist yet (a file about to be created)
  const rf = real(folder) ?? folder;
  return (allowSelf && r === rf) || isInside(r, rf);
}

export function assertGranted(p: string): string {
  const abs = resolve(p);
  if (granted.has(abs)) return abs;
  if (extname(abs).toLowerCase() === ".excalidraw") {
    const f = folderOf(abs, false);
    if (f && staysInside(abs, f, false)) return abs;
  }
  throw new Error("Path not permitted");
}

/** A granted folder or one of its subfolders. */
export function assertGrantedDir(d: string): string {
  const abs = resolve(d);
  const f = folderOf(abs, true);
  if (f && staysInside(abs, f, true)) return abs;
  throw new Error("Path not permitted");
}
