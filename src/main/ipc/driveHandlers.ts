import { z } from "zod";
import type { DriveFileInfo } from "@shared/types";
import { handle } from "./register";
import { getAppStore } from "../services/appStores";
import { DriveNetworkError } from "../services/errors";
import { getDrive, getFolderId, getSync } from "../services/drive/instance";
import { openDocument } from "../windows";
import type { Connectivity } from "../services/connectivity";

const name = z.string().trim().min(1).max(200);
const id = z.string().min(1).max(200);

export function registerDriveHandlers(connectivity: Connectivity): void {
  const sync = getSync();

  handle("drive:list", z.undefined(), async () => {
    const cached = getAppStore().get().driveListCache;
    if (!sync.isOnline()) return { files: cached, offline: true };
    try {
      const files: DriveFileInfo[] = await getDrive().list(await getFolderId());
      await getAppStore().set({ driveListCache: files });
      return { files, offline: false };
    } catch (err) {
      if (err instanceof DriveNetworkError) return { files: cached, offline: true };
      throw err;
    }
  });

  handle("drive:open", z.object({ fileId: id }), async ({ fileId }) => {
    const { meta, json } = await sync.openDriveFile(fileId);
    return { localId: meta.localId, fileId: meta.fileId, name: meta.name, json };
  });

  handle("drive:openInWindow", z.object({ fileId: id }), async ({ fileId }) => {
    const { meta } = await sync.openDriveFile(fileId);
    openDocument({ kind: "drive", localId: meta.localId, fileId: meta.fileId });
  });

  handle("drive:readCached", z.object({ localId: id }), async ({ localId }) => {
    const meta = await sync.getMeta(localId);
    return { localId, fileId: meta.fileId, name: meta.name, json: await sync.readCachedDoc(localId) };
  });

  handle("drive:create", z.object({ name, json: z.string() }), async ({ name, json }) => {
    const meta = await sync.createDriveDoc(name, json);
    return { localId: meta.localId, fileId: meta.fileId, name: meta.name, json };
  });

  handle("drive:rename", z.object({ fileId: id, name }), async ({ fileId, name }) => {
    const info = await getDrive().rename(fileId, name);
    await sync.noteRenamed(fileId, info);
    return info;
  });

  handle("drive:trash", z.object({ fileId: id }), ({ fileId }) => getDrive().trash(fileId));

  handle("sync:save", z.object({ localId: id, json: z.string() }), ({ localId, json }) => sync.saveLocal(localId, json));
  handle("sync:syncNow", z.object({ localId: id }), ({ localId }) => sync.syncNow(localId));
  handle("sync:getState", z.object({ localId: id }), ({ localId }) => sync.getState(localId));
  handle("sync:dismissNotice", z.object({ localId: id }), ({ localId }) => sync.dismissNotice(localId));
  handle("sync:reportOnline", z.object({ online: z.boolean() }), ({ online }) => connectivity.report(online));
  handle("sync:pendingCount", z.undefined(), async () => (await sync.listDirty()).length);
}
