import { basename, extname } from "node:path";
import { BrowserWindow, dialog, type IpcMainInvokeEvent } from "electron";
import { z } from "zod";
import { handle } from "./register";
import { readLocalFile, writeLocalFile, statMtime } from "../services/localFiles";
import { getAppStore, getLibraryStore } from "../services/appStores";
import { addRecent } from "../services/store";
import { assertGranted, grantPath, inGrantedFolder } from "../services/grants";
import { RECOVERY_ID, type RecoveryStore } from "../services/recovery";
import { createDocumentWindow, forceClose, infoFor, openDocument, quitState, registry } from "../windows";
import { forgetFolder, getSync } from "../services/drive/instance";
import { getAuth } from "../services/auth/instance";

const FILTERS = [{ name: "Excalidraw", extensions: ["excalidraw"] }];
const winOf = (e: IpcMainInvokeEvent) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) throw new Error("No window");
  return w;
};
const recoveryId = z.string().regex(RECOVERY_ID);
const docRef = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local"), path: z.string().nullable() }),
  z.object({ kind: z.literal("drive"), localId: z.string(), fileId: z.string().nullable() }),
]);

async function remember(path: string): Promise<void> {
  if (inGrantedFolder(path)) return; // notes opened from a folder window belong to that folder, not "recent files"
  const store = getAppStore();
  await store.set({ recent: addRecent(store.get().recent, path) });
}

export function registerFileHandlers(recovery: RecoveryStore): void {
  for (const p of getAppStore().get().recent) grantPath(p);

  handle("files:openDialog", z.undefined(), async (_i, e) => {
    const r = await dialog.showOpenDialog(winOf(e), { properties: ["openFile"], filters: FILTERS });
    if (r.canceled || !r.filePaths[0]) return null;
    const path = grantPath(r.filePaths[0]);
    const { json, mtimeMs } = await readLocalFile(path);
    await remember(path);
    return { path, json, mtimeMs };
  });

  handle("files:read", z.object({ path: z.string() }), async ({ path }) => {
    const abs = assertGranted(path);
    const r = await readLocalFile(abs);
    await remember(abs);
    return r;
  });

  handle("files:write", z.object({ path: z.string(), json: z.string() }), ({ path, json }) =>
    writeLocalFile(assertGranted(path), json),
  );

  handle("files:saveAsDialog", z.object({ json: z.string(), suggestedName: z.string().max(200) }), async ({ json, suggestedName }, e) => {
    const r = await dialog.showSaveDialog(winOf(e), { defaultPath: `${suggestedName || "Tanpa judul"}.excalidraw`, filters: FILTERS });
    if (r.canceled || !r.filePath) return null;
    const path = grantPath(extname(r.filePath) ? r.filePath : `${r.filePath}.excalidraw`);
    const { mtimeMs } = await writeLocalFile(path, json);
    await remember(path);
    return { path, mtimeMs };
  });

  handle("files:statMtime", z.object({ path: z.string() }), ({ path }) => statMtime(assertGranted(path)));
  handle("files:recent", z.undefined(), () => getAppStore().get().recent);
  handle("files:writeRecovery", z.object({ recoveryId, json: z.string() }), ({ recoveryId, json }) => recovery.write(recoveryId, json));
  handle("files:readRecovery", z.object({ recoveryId }), ({ recoveryId }) => recovery.read(recoveryId));
  handle("files:clearRecovery", z.object({ recoveryId }), ({ recoveryId }) => recovery.clear(recoveryId));
}

export function registerAppHandlers(): void {
  handle("app:getInitialDoc", z.undefined(), (_i, e) => infoFor(e.sender).initial);

  handle(
    "app:setDocState",
    z.object({ doc: docRef.optional(), title: z.string().max(300), edited: z.boolean(), untitled: z.boolean(), nonEmpty: z.boolean(), recoveryId: recoveryId.nullable() }),
    (state, e) => {
      const info = infoFor(e.sender);
      info.state = state;
      const win = winOf(e);
      if (state.doc) {
        if (state.doc.kind === "local" && state.doc.path) assertGranted(state.doc.path);
        info.initial = { ...info.initial, doc: state.doc };
        registry.rekey(win, state.doc);
      }
      win.setTitle(state.title);
      win.setDocumentEdited(state.edited || (state.untitled && state.nonEmpty));
    },
  );

  handle("app:openDocument", z.object({ doc: docRef }), ({ doc }) => {
    if (doc.kind === "local" && doc.path) assertGranted(doc.path);
    openDocument(doc);
  });
  handle("app:newWindow", z.undefined(), () => void createDocumentWindow(null));
  handle("app:closeWindow", z.undefined(), (_i, e) => forceClose(winOf(e)));
  handle("app:closeCancelled", z.undefined(), () => quitState.closeCancelled());

  handle("app:getPrefs", z.undefined(), () => {
    const { theme, langCode } = getAppStore().get();
    return { theme, langCode };
  });
  handle("app:setPrefs", z.object({ theme: z.enum(["light", "dark"]).optional(), langCode: z.string().max(16).optional() }), (p) =>
    getAppStore().set(Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined))),
  );
  handle("app:loadLibrary", z.undefined(), () => getLibraryStore().get().items);
  handle("app:saveLibrary", z.object({ items: z.array(z.unknown()).max(10_000) }), ({ items }) => getLibraryStore().set({ items }));
}

export const titleFromPath = (p: string) => basename(p, extname(p));

export function registerAuthHandlers(): void {
  handle("auth:signIn", z.undefined(), async () => {
    const r = await getAuth().signIn();
    void getSync().onSignedIn();
    return r;
  });
  handle("auth:signOut", z.undefined(), async () => {
    await getAuth().signOut();
    await forgetFolder();
  });
  handle("auth:status", z.undefined(), () => getAuth().status());
}
