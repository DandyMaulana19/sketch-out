export type SceneJSON = string; // output of serializeAsJSON
export type DocRef =
  | { kind: "local"; path: string | null }
  | { kind: "drive"; localId: string; fileId: string | null };
export type SyncStatus = "synced" | "pending" | "syncing" | "offline" | "error" | "conflict";
export interface SyncNotice {
  type: "conflict";
  copyName: string;
  originalFileId: string;
}
export interface SyncState {
  localId: string;
  status: SyncStatus;
  lastSyncedAt: number | null;
  error: string | null;
  notice: SyncNotice | null;
}
export interface DriveFileInfo {
  id: string;
  name: string;
  modifiedTime: string;
  version: string;
}
export interface CacheMeta {
  localId: string;
  fileId: string | null;
  name: string;
  baseVersion: string | null;
  dirty: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
}
