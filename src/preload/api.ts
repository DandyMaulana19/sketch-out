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
  };
  on(event: AppEvent, cb: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    sketchOut: SketchOutApi;
  }
}
