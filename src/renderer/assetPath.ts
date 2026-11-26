// Must run before @excalidraw/excalidraw is evaluated so fonts load from bundled assets (offline-safe).
(window as unknown as { EXCALIDRAW_ASSET_PATH: string }).EXCALIDRAW_ASSET_PATH = new URL("./", window.location.href).href;
