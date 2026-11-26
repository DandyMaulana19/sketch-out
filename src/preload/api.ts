import type { AppEvent } from "../shared/ipc";
import type { DocRef } from "../shared/types";

export interface InitialDoc {
  doc: DocRef | null;
  recoveryId: string | null;
  recovered: boolean;
}
export interface DocState {
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
  on(event: AppEvent, cb: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    sketchOut: SketchOutApi;
  }
}
