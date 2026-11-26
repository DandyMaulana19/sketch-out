import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw, getNonDeletedElements } from "@excalidraw/excalidraw";
import type { Env } from "./App";
import { usePrefsAndLibrary } from "./prefs";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { MenuCommand } from "../preload/api";
import { DocumentSession, type SessionStatus } from "./doc/documentSession";
import { makeLocalSink } from "./doc/sinks";
import { currentJson, fingerprint, parseScene, serialize, type El } from "./doc/scene";
import { AppMainMenu, fileName, type FileActions } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { SyncBadge, localBadge } from "./components/SyncBadge";
import { Modal } from "./components/Modal";

const api = window.sketchOut;

export interface LocalDoc {
  path: string | null;
  recoveryId: string | null;
  json: string | null;
  mtimeMs: number | null;
  recovered: boolean;
}

type Prompt = { kind: "changed" } | { kind: "missing" } | null;

export function LocalEditor({ initial, env }: { initial: LocalDoc; env: Env }) {
  const [doc, setDoc] = useState(initial);
  const [docKey, setDocKey] = useState(0);
  return <DocView key={docKey} doc={doc} env={env} onReplace={(d) => { setDoc(d); setDocKey((k) => k + 1); }} />;
}

function DocView({ doc, env, onReplace }: { doc: LocalDoc; env: Env; onReplace(d: LocalDoc): void }) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState<SessionStatus>({ status: "saved", error: null });
  const [path, setPath] = useState(doc.path);
  const [recent, setRecent] = useState<string[]>([]);
  const [nonEmpty, setNonEmpty] = useState(false);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const prefs = usePrefsAndLibrary(env, excalidrawAPI);
  const theme = prefs.theme;
  const target = useRef({ path: doc.path, recoveryId: doc.recoveryId });
  const mtime = useRef<number | null>(doc.mtimeMs);

  const session = useMemo(
    () =>
      new DocumentSession<El>({
        sink: makeLocalSink(api, target.current, (m) => (mtime.current = m)),
        delayMs: 1000,
        fingerprint,
        serialize,
        onStatus: setStatus,
      }),
    [],
  );
  useEffect(() => () => session.dispose(), [session]);

  const initialData = useMemo(async () => {
    const base = { libraryItems: env.library as never, appState: { theme: env.prefs.theme } };
    if (!doc.json) return base;
    const data = await parseScene(doc.json);
    session.markSaved((data.elements ?? []) as El[], (data.files ?? {}) as Record<string, unknown>);
    setNonEmpty(getNonDeletedElements((data.elements ?? []) as El[]).length > 0);
    return { ...data, ...base, appState: { ...data.appState, theme: env.prefs.theme } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.json, session]);

  const refreshRecent = useCallback(() => void api.files.recent().then(setRecent), []);
  useEffect(refreshRecent, [refreshRecent]);

  useEffect(() => {
    if (doc.recovered && excalidrawAPI) excalidrawAPI.setToast({ message: "Dipulihkan dari sesi sebelumnya", duration: 4000 });
  }, [doc.recovered, excalidrawAPI]);

  // Window title + "edited" dot.
  const title = path ? fileName(path) : "Tanpa judul";
  useEffect(() => {
    void api.app.setDocState({
      title: `${title} — Sketch Out`,
      edited: status.status !== "saved",
      untitled: !path,
      nonEmpty,
      recoveryId: target.current.recoveryId,
    });
  }, [title, status.status, path, nonEmpty]);

  const saveAs = useCallback(async (): Promise<boolean> => {
    if (!excalidrawAPI) return false;
    const r = await api.files.saveAsDialog({ json: currentJson(excalidrawAPI), suggestedName: title === "Tanpa judul" ? "" : title });
    if (!r) return false;
    if (target.current.recoveryId) await api.files.clearRecovery({ recoveryId: target.current.recoveryId });
    target.current = { path: r.path, recoveryId: null };
    mtime.current = r.mtimeMs;
    session.setSink(makeLocalSink(api, target.current, (m) => (mtime.current = m)));
    session.markSaved(excalidrawAPI.getSceneElementsIncludingDeleted(), excalidrawAPI.getFiles());
    setStatus({ status: "saved", error: null });
    setPath(r.path);
    refreshRecent();
    return true;
  }, [excalidrawAPI, session, title, refreshRecent]);

  const openPath = useCallback(
    async (p: string, json?: string, mtimeMs?: number) => {
      if (!path && !nonEmpty) {
        const loaded = json !== undefined ? { json, mtimeMs: mtimeMs! } : await api.files.read({ path: p });
        if (target.current.recoveryId) await api.files.clearRecovery({ recoveryId: target.current.recoveryId });
        await session.flush();
        onReplace({ path: p, recoveryId: null, json: loaded.json, mtimeMs: loaded.mtimeMs, recovered: false });
      } else {
        await api.app.openDocument({ doc: { kind: "local", path: p } });
      }
      refreshRecent();
    },
    [path, nonEmpty, session, onReplace, refreshRecent],
  );

  const actions: FileActions = useMemo(
    () => ({
      newDoc: () => void api.app.newWindow(),
      openLocal: async () => {
        const r = await api.files.openDialog();
        if (r) await openPath(r.path, r.json, r.mtimeMs);
      },
      saveAs: () => void saveAs(),
      openRecent: (p) => void openPath(p).catch((e) => excalidrawAPI?.setToast({ message: `Tidak bisa membuka: ${String(e.message ?? e).split(": ").pop()}`, closable: true })),
    }),
    [openPath, saveAs, excalidrawAPI],
  );

  // Native menu commands.
  useEffect(
    () =>
      api.on("menu:command", async (payload) => {
        const cmd = payload as MenuCommand;
        if (cmd === "open") actions.openLocal();
        else if (cmd === "saveAs") void saveAs();
        else if (cmd === "save") {
          if (target.current.path) await session.flush();
          else void saveAs();
        } else if (cmd === "flushThenClose") {
          await session.flush().catch(() => {});
          await api.app.closeWindow();
        } else if (cmd === "saveAsThenClose") {
          if (await saveAs()) await api.app.closeWindow();
        }
      }),
    [actions, saveAs, session],
  );

  // Detect changes made to the file outside the app when the window regains focus.
  useEffect(() => {
    const onFocus = async () => {
      const p = target.current.path;
      if (!p || prompt) return;
      const m = await api.files.statMtime({ path: p });
      if (m === null) setPrompt({ kind: "missing" });
      else if (mtime.current !== null && Math.abs(m - mtime.current) > 1) setPrompt({ kind: "changed" });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [prompt]);

  useEffect(() => {
    // Test hook: only present when the app was launched by the e2e suite.
    if (excalidrawAPI && new URLSearchParams(location.search).has("e2e")) (window as unknown as { __so: unknown }).__so = excalidrawAPI;
  }, [excalidrawAPI]);

  const badge = localBadge(status.status, status.error, !path);
  if (status.status === "error" && status.error === "File tidak ditemukan") badge.action = { label: "Simpan sebagai…", run: () => void saveAs() };

  return (
    <div style={{ height: "100%" }}>
      <Excalidraw
        excalidrawAPI={setExcalidrawAPI}
        initialData={initialData}
        langCode={prefs.langCode}
        libraryReturnUrl="sketchout://addLibrary"
        onLibraryChange={prefs.onLibraryChange}
        onChange={(elements, appState, files) => {
          session.onChange(elements, appState, files);
          const ne = getNonDeletedElements(elements).length > 0;
          if (ne !== nonEmpty) setNonEmpty(ne);
          if (appState.theme !== theme) prefs.setTheme(appState.theme);
        }}
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }}
        renderTopRightUI={() => <SyncBadge view={badge} />}
      >
        <AppMainMenu actions={actions} recent={recent} langCode={prefs.langCode} onLangChange={prefs.setLangCode} />
        <AppWelcomeScreen actions={actions} recent={recent} />
      </Excalidraw>
      {prompt?.kind === "changed" && (
        <Modal
          dark={theme === "dark"}
          title="File diubah di luar Sketch Out"
          actions={[
            { label: "Pertahankan versi di app", run: () => { setPrompt(null); void api.files.statMtime({ path: target.current.path! }).then((m) => (mtime.current = m)); } },
            { label: "Muat ulang", primary: true, run: () => { setPrompt(null); void api.files.read({ path: target.current.path! }).then((r) => onReplace({ path: target.current.path, recoveryId: null, json: r.json, mtimeMs: r.mtimeMs, recovered: false })); } },
          ]}
        >
          File ini berubah sejak terakhir disimpan dari aplikasi. Muat ulang untuk melihat versi terbaru, atau pertahankan versi yang sedang terbuka (versi ini akan menimpa file saat disimpan).
        </Modal>
      )}
      {prompt?.kind === "missing" && (
        <Modal
          dark={theme === "dark"}
          title="File dipindah atau dihapus"
          actions={[
            { label: "Tutup", run: () => setPrompt(null) },
            { label: "Simpan sebagai…", primary: true, run: () => { setPrompt(null); void saveAs(); } },
          ]}
        >
          File yang sedang terbuka tidak ditemukan lagi di lokasi semula. Simpan ke lokasi baru supaya pekerjaanmu tidak hilang.
        </Modal>
      )}
    </div>
  );
}
