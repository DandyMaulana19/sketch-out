import type { AppEvent } from "../shared/ipc";
import type { DocRef, DriveFileInfo, SyncState } from "../shared/types";

export interface InitialDoc {
  doc: DocRef | null;
  recoveryId: string | null;
  recovered: boolean;
}
export interface DriveDocData {
  localId: string;
  fileId: string | null;
  name: string;
  json: string;
}
export interface DocState {
  doc?: DocRef;
  title: string;
  edited: boolean;
  untitled: boolean;
  nonEmpty: boolean;
  recoveryId: string | null;
}
export interface Prefs {
  theme: "light" | "dark";
  langCode: string;
}
export type MenuCommand = "new" | "open" | "save" | "saveAs" | "flushThenClose" | "saveAsThenClose";

/** Method names mirror CHANNELS ("ns:method" → api.ns.method). */
export interface SketchOutApi {
  files: {
    openDialog(): Promise<{ path: string; json: string; mtimeMs: number } | null>;
    read(i: { path: string }): Promise<{ json: string; mtimeMs: number }>;
    write(i: { path: string; json: string }): Promise<{ mtimeMs: number }>;
    saveAsDialog(i: { json: string; suggestedName: string }): Promise<{ path: string; mtimeMs: number } | null>;
    statMtime(i: { path: string }): Promise<number | null>;
    recent(): Promise<string[]>;
    writeRecovery(i: { recoveryId: string; json: string }): Promise<void>;
    readRecovery(i: { recoveryId: string }): Promise<string | null>;
    clearRecovery(i: { recoveryId: string }): Promise<void>;
  };
  app: {
    getInitialDoc(): Promise<InitialDoc>;
    setDocState(i: DocState): Promise<void>;
    openDocument(i: { doc: DocRef }): Promise<void>;
    newWindow(): Promise<void>;
    closeWindow(): Promise<void>;
    getPrefs(): Promise<Prefs>;
    setPrefs(i: Partial<Prefs>): Promise<void>;
    loadLibrary(): Promise<unknown[]>;
    saveLibrary(i: { items: unknown[] }): Promise<void>;
  };
  auth: {
    signIn(): Promise<{ email: string | null }>;
    signOut(): Promise<void>;
    status(): Promise<{ signedIn: boolean; email: string | null }>;
  };
  drive: {
    list(): Promise<{ files: DriveFileInfo[]; offline: boolean }>;
    open(i: { fileId: string }): Promise<DriveDocData>;
    openInWindow(i: { fileId: string }): Promise<void>;
    readCached(i: { localId: string }): Promise<DriveDocData>;
    create(i: { name: string; json: string }): Promise<DriveDocData>;
    rename(i: { localId?: string; fileId: string; name: string }): Promise<DriveFileInfo>;
    trash(i: { fileId: string }): Promise<void>;
  };
  sync: {
    save(i: { localId: string; json: string }): Promise<void>;
    syncNow(i: { localId: string }): Promise<SyncState>;
    getState(i: { localId: string }): Promise<SyncState>;
    dismissNotice(i: { localId: string }): Promise<void>;
    reportOnline(i: { online: boolean }): Promise<void>;
    pendingCount(): Promise<number>;
  };
  on(event: AppEvent, cb: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    sketchOut: SketchOutApi;
  }
}
