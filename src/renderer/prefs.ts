import { useCallback, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI, LibraryItems } from "@excalidraw/excalidraw/types";
import type { Env } from "./App";

const api = window.sketchOut;

/** Theme, language and library persistence, plus "Browse libraries" callbacks from main. */
export function usePrefsAndLibrary(env: Env, excalidrawAPI: ExcalidrawImperativeAPI | null) {
  const [theme, setThemeState] = useState(env.prefs.theme);
  const [langCode, setLang] = useState(env.prefs.langCode);
  const libTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTheme = useCallback((t: "light" | "dark") => {
    setThemeState(t);
    void api.app.setPrefs({ theme: t });
  }, []);
  const setLangCode = useCallback((code: string) => {
    setLang(code);
    void api.app.setPrefs({ langCode: code });
  }, []);
  const onLibraryChange = useCallback((items: LibraryItems) => {
    if (libTimer.current) clearTimeout(libTimer.current);
    libTimer.current = setTimeout(() => void api.app.saveLibrary({ items: [...items] }), 500);
  }, []);

  useEffect(() => {
    if (!excalidrawAPI) return;
    return api.on("library:add", (payload) => {
      const p = payload as { ok: boolean; json?: string; error?: string };
      if (!p.ok || !p.json) {
        excalidrawAPI.setToast({ message: `Gagal menambahkan library: ${p.error ?? ""}`, closable: true });
        return;
      }
      void excalidrawAPI
        .updateLibrary({ libraryItems: new Blob([p.json], { type: "application/json" }), merge: true, openLibraryMenu: true, defaultStatus: "published" })
        .catch((e: Error) => excalidrawAPI.setToast({ message: `Gagal menambahkan library: ${e.message}`, closable: true }));
    });
  }, [excalidrawAPI]);

  return { theme, setTheme, langCode, setLangCode, onLibraryChange };
}
