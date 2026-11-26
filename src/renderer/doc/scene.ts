import { hashElementsVersion, loadFromBlob, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

export type El = ExcalidrawElement;

export const fingerprint = (els: readonly El[]) => String(hashElementsVersion(els));
export const serialize = (els: readonly El[], appState: object, files: Record<string, unknown>) =>
  serializeAsJSON(els, appState as Partial<AppState>, files as BinaryFiles, "local");

export async function parseScene(json: string): Promise<ExcalidrawInitialDataState> {
  const data = await loadFromBlob(new Blob([json], { type: "application/json" }), null, null);
  return { elements: data.elements, appState: data.appState, files: data.files };
}

export function currentJson(api: ExcalidrawImperativeAPI): string {
  return serialize(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
}
