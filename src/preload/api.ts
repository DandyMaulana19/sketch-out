import type { AppEvent } from "../shared/ipc";
import type { DocRef, DriveFileInfo, NoteInfo, SyncState } from "../shared/types";

export interface InitialDoc {
  doc: DocRef | null;
  /** Set when this window shows an opened folder (sidebar + tabs). */
  folder: string | null;
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
export type MenuCommand = "new" | "open" | "save" | "saveAs" | "flushThenClose" | "saveAsThenClose" | "closeTab" | "nextTab" | "prevTab" | "aiConnect";
export type AiOp = "read" | "view" | "add" | "update" | "delete" | "mermaid";
export interface AiRequest {
  id: string;
  path: string;
  op: AiOp;
  args: unknown;
}
export type AiClientId = "claude-code" | "codex" | "claude-desktop" | "opencode" | "gemini" | "cursor" | "vscode";
export interface AiClientInfo {
  id: AiClientId;
  label: string;
  restartNote: string | null;
  status: "missing" | "available" | "connected" | "outdated" | "unreadable";
}
export interface FolderTabs {
  open: string[];
  active: string | null;
}

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
    closeCancelled(): Promise<void>;
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
  folder: {
    openDialog(): Promise<void>;
    open(i: { dir: string }): Promise<void>;
    recent(): Promise<string[]>;
    list(i: { dir: string }): Promise<NoteInfo[]>;
    create(i: { dir: string; name: string; json: string }): Promise<{ path: string }>;
    rename(i: { path: string; name: string }): Promise<{ path: string }>;
    trash(i: { path: string }): Promise<void>;
    /** Paths relative to the folder. */
    getTabs(i: { dir: string }): Promise<FolderTabs>;
    setTabs(i: { dir: string } & FolderTabs): Promise<void>;
  };
  ai: {
    /** Answer an `ai:request` event from main (an MCP tool call). */
    respond(i: { id: string; result?: unknown; error?: string }): Promise<void>;
    clients(): Promise<AiClientInfo[]>;
    connect(i: { id: AiClientId }): Promise<AiClientInfo>;
    disconnect(i: { id: AiClientId }): Promise<AiClientInfo>;
    copyConfig(i: { kind: "command" | "json" }): Promise<string>;
  };
  on(event: AppEvent, cb: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    sketchOut: SketchOutApi;
  }
}
