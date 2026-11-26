import { stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { BrowserWindow, dialog, shell } from "electron";
import { z } from "zod";
import { handle } from "./register";
import { getAppStore } from "../services/appStores";
import { addRecent } from "../services/store";
import { assertGranted, assertGrantedDir, grantFolder } from "../services/grants";
import { createNote, listNotes, renameNote } from "../services/folders";
import { openFolderWindow } from "../windows";

const MAX_TABS = 100;
const relPath = z.string().max(1000);

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Open (or focus) a folder window for a directory the user picked, and remember it. */
export async function openFolder(dir: string): Promise<void> {
  if (!(await isDir(dir))) throw new Error("Folder tidak ditemukan");
  const abs = grantFolder(dir);
  const store = getAppStore();
  await store.set({ recentFolders: addRecent(store.get().recentFolders, abs) });
  openFolderWindow(abs);
}

export async function openFolderFromDialog(parent?: BrowserWindow | null): Promise<void> {
  const opts: Electron.OpenDialogOptions = { properties: ["openDirectory", "createDirectory"], buttonLabel: "Buka folder" };
  const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
  if (r.canceled || !r.filePaths[0]) return;
  await openFolder(r.filePaths[0]);
}

const assertRoot = (dir: string): string => assertGrantedDir(resolve(dir));

const insideRoot = (root: string, rel: string) => {
  const r = relative(root, resolve(root, rel));
  return r !== "" && !r.startsWith("..");
};

export function registerFolderHandlers(): void {
  for (const d of getAppStore().get().recentFolders) grantFolder(d);

  handle("folder:openDialog", z.undefined(), (_i, e) => openFolderFromDialog(BrowserWindow.fromWebContents(e.sender)));
  handle("folder:open", z.object({ dir: z.string().max(4096) }), ({ dir }) => {
    const abs = resolve(dir);
    if (!getAppStore().get().recentFolders.includes(abs)) throw new Error("Path not permitted");
    return openFolder(abs);
  });
  handle("folder:recent", z.undefined(), () => getAppStore().get().recentFolders);
  handle("folder:list", z.object({ dir: z.string().max(4096) }), ({ dir }) => listNotes(assertRoot(dir)));
  handle("folder:create", z.object({ dir: z.string().max(4096), name: z.string().max(200), json: z.string() }), async ({ dir, name, json }) => ({
    path: await createNote(assertGrantedDir(dir), name, json),
  }));
  handle("folder:rename", z.object({ path: z.string().max(4096), name: z.string().max(200) }), async ({ path, name }) => ({
    path: await renameNote(assertGranted(path), name),
  }));
  handle("folder:trash", z.object({ path: z.string().max(4096) }), ({ path }) => shell.trashItem(assertGranted(path)));

  handle("folder:getTabs", z.object({ dir: z.string().max(4096) }), ({ dir }) => {
    const root = assertRoot(dir);
    return getAppStore().get().folderTabs[root] ?? { open: [], active: null };
  });
  handle(
    "folder:setTabs",
    z.object({ dir: z.string().max(4096), open: z.array(relPath).max(MAX_TABS), active: relPath.nullable() }),
    ({ dir, open, active }) => {
      const root = assertRoot(dir);
      const clean = open.filter((r) => insideRoot(root, r)).map((r) => r.split(sep).join("/"));
      const store = getAppStore();
      const { recentFolders, folderTabs } = store.get();
      // Keep tab state only for folders still in the recent list.
      const kept = Object.fromEntries(Object.entries(folderTabs).filter(([k]) => recentFolders.includes(k)));
      return store.set({ folderTabs: { ...kept, [root]: { open: clean, active: active && clean.includes(active) ? active : null } } });
    },
  );
}
