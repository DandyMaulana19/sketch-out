import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Excalidraw, MainMenu, WelcomeScreen, getNonDeletedElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { MenuCommand } from "../preload/api";
import type { SyncState } from "../shared/types";
import type { Account, Env } from "./App";
import { usePrefsAndLibrary } from "./prefs";
import { DocumentSession, type SaveStatus, type SessionStatus } from "./doc/documentSession";
import { makeDriveSink, makeLocalSink } from "./doc/sinks";
import { currentJson, fingerprint, parseScene, serialize, type El } from "./doc/scene";
import { refOf, type Doc } from "./doc/types";
import { AppMainMenu, fileName, type FileActions } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { SyncBadge, driveBadge, localBadge, type BadgeView } from "./components/SyncBadge";
import { Modal } from "./components/Modal";
import { DriveDialog } from "./components/DriveDialog";
import { ConflictNotice } from "./components/ConflictNotice";
import { NameDialog } from "./components/NameDialog";
import { CloudIcon, UserIcon } from "./components/icons";

const api = window.sketchOut;
const errText = (e: unknown) => String((e as Error)?.message ?? e).split(": ").pop() ?? "Terjadi kesalahan";

export function Editor({ initial, env }: { initial: Doc; env: Env }) {
  const [doc, setDoc] = useState(initial);
  const [docKey, setDocKey] = useState(0);
  const [account, setAccount] = useState<Account>(env.account);
  return (
    <DocView
      key={docKey}
      doc={doc}
      env={env}
      account={account}
      setAccount={setAccount}
      onReplace={(d) => {
        setDoc(d);
        setDocKey((k) => k + 1);
      }}
    />
  );
}

type Overlay =
  | { kind: "changed" }
  | { kind: "missing" }
  | { kind: "drive" }
  | { kind: "nameForDrive"; initial: string; then: "copy" | "new" }
  | { kind: "signOut"; pending: number }
  | null;

/** Lets a folder window save the open note before switching tabs. `flush` resolves true when nothing is left unsaved. */
export interface DocHandle {
  flush(): Promise<boolean>;
}

export interface ViewProps {
  doc: Doc;
  env: Env;
  account: Account;
  setAccount(a: Account): void;
  onReplace(d: Doc): void;
  /** Folder windows only. */
  handle?: MutableRefObject<DocHandle | null>;
  onStatus?(s: SaveStatus): void;
  onPath?(p: string): void;
  onTheme?(t: "light" | "dark"): void;
  /** Window title suffix instead of "Sketch Out" (the folder name). */
  titleSuffix?: string;
}

export function DocView({ doc, env, account, setAccount, onReplace, handle, onStatus, onPath, onTheme, titleSuffix }: ViewProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const [status, setStatus] = useState<SessionStatus>({ status: "saved", error: null });
  const [path, setPath] = useState(doc.kind === "local" ? doc.path : null);
  const [driveName, setDriveName] = useState(doc.kind === "drive" ? doc.name : "");
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [nonEmpty, setNonEmpty] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const prefs = usePrefsAndLibrary(env, excalidrawAPI);
  const theme = prefs.theme;
  const dark = theme === "dark";
  const localTarget = useRef({ path: doc.kind === "local" ? doc.path : null, recoveryId: doc.kind === "local" ? doc.recoveryId : null });
  const mtime = useRef<number | null>(doc.kind === "local" ? doc.mtimeMs : null);
  const toast = useCallback((message: string) => excalidrawAPI?.setToast({ message, closable: true, duration: 6000 }), [excalidrawAPI]);

  const session = useMemo(
    () =>
      new DocumentSession<El>({
        sink: doc.kind === "drive" ? makeDriveSink(api, doc.localId) : makeLocalSink(api, localTarget.current, (m) => (mtime.current = m)),
        delayMs: doc.kind === "drive" ? 500 : 1000,
        fingerprint,
        serialize,
        onStatus: setStatus,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => () => session.dispose(), [session]);
  useEffect(() => {
    if (!handle) return;
    handle.current = {
      flush: async () => {
        await session.flush();
        return !session.hasUnsavedChanges;
      },
    };
    return () => {
      handle.current = null;
    };
  }, [handle, session]);
  useEffect(() => onStatus?.(status.status), [onStatus, status.status]);
  useEffect(() => {
    if (path) onPath?.(path);
  }, [onPath, path]);
  useEffect(() => onTheme?.(theme), [onTheme, theme]);

  const initialData = useMemo(async () => {
    const base = { libraryItems: env.library as never, appState: { theme: env.prefs.theme } };
    if (!doc.json) {
      session.markSaved([], {});
      return base;
    }
    const data = await parseScene(doc.json);
    session.markSaved((data.elements ?? []) as El[], (data.files ?? {}) as Record<string, unknown>);
    setNonEmpty(getNonDeletedElements((data.elements ?? []) as El[]).length > 0);
    return { ...data, ...base, appState: { ...data.appState, theme: env.prefs.theme } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const refreshRecent = useCallback(() => {
    void api.files.recent().then(setRecent);
    void api.folder.recent().then(setRecentFolders);
  }, []);
  useEffect(refreshRecent, [refreshRecent]);

  useEffect(() => {
    if (doc.kind === "local" && doc.recovered && excalidrawAPI) excalidrawAPI.setToast({ message: "Dipulihkan dari sesi sebelumnya", duration: 4000 });
  }, [doc, excalidrawAPI]);

  // Drive sync state from the main process.
  useEffect(() => {
    if (doc.kind !== "drive") return;
    void api.sync.getState({ localId: doc.localId }).then(setSyncState);
    return api.on("sync:state", (payload) => {
      const st = payload as SyncState;
      if (st.localId !== doc.localId) return;
      setSyncState(st);
      if (st.notice) setDriveName(st.notice.copyName);
    });
  }, [doc]);

  // Report browser connectivity to main (one of the online signals).
  useEffect(() => {
    const on = () => void api.sync.reportOnline({ online: true });
    const off = () => void api.sync.reportOnline({ online: false });
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const title = doc.kind === "drive" ? driveName : path ? fileName(path) : "Tanpa judul";
  useEffect(() => {
    void api.app.setDocState({
      doc: refOf(doc, path),
      title: `${title} — ${titleSuffix ?? "Sketch Out"}`,
      edited: status.status !== "saved",
      untitled: doc.kind === "local" && !path,
      nonEmpty,
      recoveryId: localTarget.current.recoveryId,
    });
  }, [doc, title, titleSuffix, status.status, path, nonEmpty]);

  const replaceable = doc.kind === "local" && !path && !nonEmpty;
  const dropRecovery = async () => {
    if (localTarget.current.recoveryId) await api.files.clearRecovery({ recoveryId: localTarget.current.recoveryId });
  };

  const saveAs = useCallback(async (): Promise<boolean> => {
    if (!excalidrawAPI) return false;
    const r = await api.files.saveAsDialog({ json: currentJson(excalidrawAPI), suggestedName: title === "Tanpa judul" ? "" : title });
    if (!r) return false;
    if (doc.kind === "drive") {
      // This window now edits the local copy; the Drive document stays as it is.
      await session.flush();
      const loaded = await api.files.read({ path: r.path });
      onReplace({ kind: "local", path: r.path, recoveryId: null, json: loaded.json, mtimeMs: loaded.mtimeMs, recovered: false });
      return true;
    }
    await dropRecovery();
    localTarget.current = { path: r.path, recoveryId: null };
    mtime.current = r.mtimeMs;
    session.setSink(makeLocalSink(api, localTarget.current, (m) => (mtime.current = m)));
    session.markSaved(excalidrawAPI.getSceneElementsIncludingDeleted(), excalidrawAPI.getFiles());
    setStatus({ status: "saved", error: null });
    setPath(r.path);
    refreshRecent();
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excalidrawAPI, session, title, refreshRecent, doc, onReplace]);

  const openPath = useCallback(
    async (p: string, json?: string, mtimeMs?: number) => {
      if (replaceable) {
        const loaded = json !== undefined ? { json, mtimeMs: mtimeMs! } : await api.files.read({ path: p });
        await dropRecovery();
        onReplace({ kind: "local", path: p, recoveryId: null, json: loaded.json, mtimeMs: loaded.mtimeMs, recovered: false });
      } else {
        await api.app.openDocument({ doc: { kind: "local", path: p } });
      }
      refreshRecent();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replaceable, onReplace, refreshRecent],
  );

  const openDriveFile = useCallback(
    async (fileId: string) => {
      setOverlay(null);
      try {
        if (replaceable) {
          const d = await api.drive.open({ fileId });
          await dropRecovery();
          onReplace({ kind: "drive", ...d });
        } else await api.drive.openInWindow({ fileId });
      } catch (e) {
        toast(`Tidak bisa membuka: ${errText(e)}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [replaceable, onReplace, toast],
  );

  const createOnDrive = useCallback(
    async (name: string, mode: "copy" | "new") => {
      setOverlay(null);
      try {
        const json = mode === "copy" && excalidrawAPI ? currentJson(excalidrawAPI) : serialize([], {}, {});
        const d = await api.drive.create({ name, json });
        if (mode === "copy" || replaceable) {
          await session.flush();
          await dropRecovery();
          onReplace({ kind: "drive", ...d });
        } else await api.app.openDocument({ doc: { kind: "drive", localId: d.localId, fileId: d.fileId } });
      } catch (e) {
        toast(`Gagal menyimpan ke Drive: ${errText(e)}`);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [excalidrawAPI, replaceable, session, onReplace, toast],
  );

  const signIn = useCallback(async () => {
    try {
      const r = await api.auth.signIn();
      setAccount({ signedIn: true, email: r.email });
      toast(r.email ? `Masuk sebagai ${r.email}` : "Berhasil masuk ke Google");
    } catch (e) {
      toast(errText(e));
    }
  }, [setAccount, toast]);

  const signOut = useCallback(async () => {
    await api.auth.signOut();
    setAccount({ signedIn: false, email: null });
    setOverlay(null);
  }, [setAccount]);

  const actions: FileActions = useMemo(
    () => ({
      newDoc: () => void api.app.newWindow(),
      openLocal: async () => {
        const r = await api.files.openDialog().catch((e) => (toast(`Tidak bisa membuka: ${errText(e)}`), null));
        if (r) await openPath(r.path, r.json, r.mtimeMs);
      },
      saveAs: () => void saveAs(),
      openRecent: (p) => void openPath(p).catch((e) => toast(`Tidak bisa membuka: ${errText(e)}`)),
      openFolder: () => void api.folder.openDialog().catch((e) => toast(`Tidak bisa membuka folder: ${errText(e)}`)),
      openRecentFolder: (d) => void api.folder.open({ dir: d }).catch((e) => toast(`Tidak bisa membuka folder: ${errText(e)}`)),
    }),
    [openPath, saveAs, toast],
  );

  // Native menu commands.
  useEffect(
    () =>
      api.on("menu:command", async (payload) => {
        const cmd = payload as MenuCommand;
        if (cmd === "open") actions.openLocal();
        else if (cmd === "saveAs") void saveAs();
        else if (cmd === "save") {
          if (doc.kind === "drive" || localTarget.current.path) await session.flush();
          else void saveAs();
        } else if (cmd === "flushThenClose") {
          await session.flush().catch(() => {});
          await api.app.closeWindow();
        } else if (cmd === "saveAsThenClose") {
          if (await saveAs().catch(() => false)) await api.app.closeWindow();
          else await api.app.closeCancelled();
        }
      }),
    [actions, saveAs, session, doc],
  );

  // Detect edits made to a local file outside the app when the window regains focus.
  useEffect(() => {
    if (doc.kind !== "local") return;
    const onFocus = async () => {
      const p = localTarget.current.path;
      if (!p || overlay) return;
      const m = await api.files.statMtime({ path: p });
      if (m === null) setOverlay({ kind: "missing" });
      else if (mtime.current !== null && Math.abs(m - mtime.current) > 1) setOverlay({ kind: "changed" });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [overlay, doc.kind]);

  useEffect(() => {
    // Test hook: only present when the app was launched by the e2e suite.
    if (excalidrawAPI && new URLSearchParams(location.search).has("e2e")) (window as unknown as { __so: unknown }).__so = excalidrawAPI;
  }, [excalidrawAPI]);

  let badge: BadgeView;
  if (doc.kind === "drive") {
    const local = status.status === "pending" || status.status === "saving";
    badge = local
      ? { tone: "busy", label: "Menyinkron…" }
      : status.status === "error"
        ? { tone: "error", label: status.error ?? "Gagal menyimpan di perangkat" }
        : driveBadge(syncState ?? { localId: doc.localId, status: "synced", lastSyncedAt: null, error: null, notice: null }, {
            syncNow: () => void api.sync.syncNow({ localId: doc.localId }),
            signIn: () => void signIn(),
          });
  } else {
    badge = localBadge(status.status, status.error, !path);
    if (status.status === "error" && status.error === "File tidak ditemukan") badge.action = { label: "Simpan sebagai…", run: () => void saveAs() };
  }

  const driveItems = account.signedIn ? (
    <>
      <MainMenu.Item icon={CloudIcon} onSelect={() => setOverlay({ kind: "drive" })}>Buka dari Google Drive…</MainMenu.Item>
      <MainMenu.Item icon={CloudIcon} onSelect={() => setOverlay({ kind: "nameForDrive", initial: title === "Tanpa judul" ? "" : title, then: "copy" })}>
        Simpan ke Google Drive…
      </MainMenu.Item>
      <MainMenu.Item
        icon={UserIcon}
        title={account.email ?? undefined}
        onSelect={async () => {
          const pending = await api.sync.pendingCount();
          if (pending > 0) setOverlay({ kind: "signOut", pending });
          else void signOut();
        }}
      >
        Keluar dari Google{account.email ? ` (${account.email})` : ""}
      </MainMenu.Item>
    </>
  ) : (
    <MainMenu.Item icon={UserIcon} onSelect={() => void signIn()}>Masuk dengan Google…</MainMenu.Item>
  );

  const welcomeDrive = account.signedIn ? (
    <WelcomeScreen.Center.MenuItem onSelect={() => setOverlay({ kind: "drive" })} icon={CloudIcon} shortcut={null}>
      Buka dari Google Drive…
    </WelcomeScreen.Center.MenuItem>
  ) : (
    <WelcomeScreen.Center.MenuItem onSelect={() => void signIn()} icon={UserIcon} shortcut={null}>
      Masuk dengan Google…
    </WelcomeScreen.Center.MenuItem>
  );

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
        <AppMainMenu actions={actions} recent={recent} recentFolders={recentFolders} extra={driveItems} langCode={prefs.langCode} onLangChange={prefs.setLangCode} />
        <AppWelcomeScreen actions={actions} recent={recent} recentFolders={recentFolders} extra={welcomeDrive} />
      </Excalidraw>

      {doc.kind === "drive" && syncState?.notice && (
        <ConflictNotice
          dark={dark}
          notice={syncState.notice}
          onOpenOriginal={() => void api.drive.openInWindow({ fileId: syncState.notice!.originalFileId }).catch((e) => toast(`Tidak bisa membuka: ${errText(e)}`))}
          onDismiss={() => void api.sync.dismissNotice({ localId: doc.localId })}
        />
      )}

      {overlay?.kind === "drive" && (
        <DriveDialog
          dark={dark}
          currentFileId={doc.kind === "drive" ? doc.fileId : null}
          onClose={() => setOverlay(null)}
          onOpen={(id) => void openDriveFile(id)}
          onNew={() => setOverlay({ kind: "nameForDrive", initial: "", then: "new" })}
          onError={toast}
        />
      )}

      {overlay?.kind === "nameForDrive" && (
        <NameDialog
          dark={dark}
          title={overlay.then === "copy" ? "Simpan ke Google Drive" : "Gambar baru di Google Drive"}
          initial={overlay.initial || "Tanpa judul"}
          confirmLabel="Simpan"
          onCancel={() => setOverlay(null)}
          onConfirm={(name) => void createOnDrive(name, overlay.then)}
        />
      )}

      {overlay?.kind === "signOut" && (
        <Modal
          dark={dark}
          title="Keluar dari Google?"
          actions={[
            { label: "Batal", run: () => setOverlay(null) },
            { label: "Keluar", primary: true, run: () => void signOut() },
          ]}
        >
          Ada {overlay.pending} gambar yang belum terunggah ke Drive. Gambar itu tetap aman di perangkat ini dan akan diunggah otomatis saat kamu masuk lagi.
        </Modal>
      )}

      {overlay?.kind === "changed" && (
        <Modal
          dark={dark}
          title="File diubah di luar Sketch Out"
          actions={[
            {
              label: "Pertahankan versi di app",
              run: () => {
                setOverlay(null);
                void api.files.statMtime({ path: localTarget.current.path! }).then((m) => (mtime.current = m));
              },
            },
            {
              label: "Muat ulang",
              primary: true,
              run: () => {
                setOverlay(null);
                const p = localTarget.current.path!;
                void api.files.read({ path: p }).then((r) => onReplace({ kind: "local", path: p, recoveryId: null, json: r.json, mtimeMs: r.mtimeMs, recovered: false }));
              },
            },
          ]}
        >
          File ini berubah sejak terakhir disimpan dari aplikasi. Muat ulang untuk melihat versi terbaru, atau pertahankan versi yang sedang terbuka (versi ini akan menimpa file saat disimpan).
        </Modal>
      )}

      {overlay?.kind === "missing" && (
        <Modal
          dark={dark}
          title="File dipindah atau dihapus"
          actions={[
            { label: "Tutup", run: () => setOverlay(null) },
            { label: "Simpan sebagai…", primary: true, run: () => { setOverlay(null); void saveAs(); } },
          ]}
        >
          File yang sedang terbuka tidak ditemukan lagi di lokasi semula. Simpan ke lokasi baru supaya pekerjaanmu tidak hilang.
        </Modal>
      )}
    </div>
  );
}
