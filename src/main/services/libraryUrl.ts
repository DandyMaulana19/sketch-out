export const LIBRARY_RETURN_URL = "sketchout://addLibrary";

/** Library callback from libraries.excalidraw.com → the .excalidrawlib URL, only if it is hosted there over https. */
export function parseAddLibraryUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "sketchout:") return null;
    const lib = new URLSearchParams(u.hash.replace(/^#/, "")).get("addLibrary");
    if (!lib) return null;
    const l = new URL(lib);
    return l.protocol === "https:" && l.hostname === "libraries.excalidraw.com" ? l.href : null;
  } catch {
    return null;
  }
}
