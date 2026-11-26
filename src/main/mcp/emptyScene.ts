/** A new, empty Excalidraw scene (same shape the renderer's serializer writes). */
export function serializeEmpty(): string {
  return JSON.stringify(
    { type: "excalidraw", version: 2, source: "https://sketchout.app", elements: [], appState: { gridSize: 20, viewBackgroundColor: "#ffffff" }, files: {} },
    null,
    2,
  );
}
