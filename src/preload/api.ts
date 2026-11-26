import type { AppEvent } from "../shared/ipc";

/** Grows as tasks add namespaces. Method names mirror CHANNELS ("ns:method" → api.ns.method). */
export interface SketchOutApi {
  on(event: AppEvent, cb: (payload: unknown) => void): () => void;
}

declare global {
  interface Window {
    sketchOut: SketchOutApi;
  }
}
