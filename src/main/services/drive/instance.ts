import { join } from "node:path";
import { app, net } from "electron";
import { getAuth } from "../auth/instance";
import { getAppStore } from "../appStores";
import { CacheStore } from "../cache/cacheStore";
import { SyncEngine } from "../sync/syncEngine";
import { createDriveClient, type DriveClient } from "./driveClient";

let drive: DriveClient | null = null;
let engine: SyncEngine | null = null;
let folderPromise: Promise<string> | null = null;

export function getDrive(): DriveClient {
  drive ??= createDriveClient({
    fetch: (input, init) => net.fetch(input as string, init),
    getAccessToken: (opts) => getAuth().getAccessToken(opts),
  });
  return drive;
}

/** The "Sketch Out" folder id, remembered in settings after the first lookup. */
export function getFolderId(): Promise<string> {
  const known = getAppStore().get().driveFolderId;
  if (known) return Promise.resolve(known);
  folderPromise ??= getDrive()
    .ensureAppFolder()
    .then(async (id) => {
      await getAppStore().set({ driveFolderId: id });
      return id;
    })
    .finally(() => (folderPromise = null));
  return folderPromise;
}

export function forgetFolder(): Promise<void> {
  return getAppStore().set({ driveFolderId: null, driveListCache: [] });
}

export function getSync(): SyncEngine {
  engine ??= new SyncEngine({
    drive: getDrive(),
    cache: new CacheStore(join(app.getPath("userData"), "drive-cache")),
    getFolderId,
    now: () => Date.now(),
    initialOnline: net.isOnline(),
  });
  return engine;
}
