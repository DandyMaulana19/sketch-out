import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { NoteInfo } from "../../shared/types";
import type { MenuCommand } from "../../preload/api";
import type { Account, Env } from "../App";
import { DocView, type DocHandle } from "../Editor";
import type { Doc } from "../doc/types";
import type { SaveStatus } from "../doc/documentSession";
import { serialize } from "../doc/scene";
import { folderName } from "../components/AppMainMenu";
import { Modal } from "../components/Modal";
import { NameDialog } from "../components/NameDialog";
import { Sidebar, type SidebarTarget } from "./Sidebar";
import { buildTree, tabLabels, tabsReducer, type TabsAction, type TabsState } from "./tabs";

const api = window.sketchOut;
const errText = (e: unknown) => String((e as Error)?.message ?? e).split(": ").pop() ?? "Terjadi kesalahan";
const SIDEBAR_KEY = "so.sidebarHidden";

const readHidden = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
};

type Dialog = { kind: "new"; dir: string } | { kind: "rename"; note: NoteInfo } | { kind: "trash"; note: NoteInfo } | null;
interface Current {
  doc: Doc;
  env: Env;
  gen: number;
}

export function FolderWorkspace({ folder, env }: { folder: string; env: Env }) {
  const title = folderName(folder);
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabs, setTabs] = useState<TabsState>({ open: [], active: null });
  const tabsRef = useRef(tabs);
  const [current, setCurrent] = useState<Current | null>(null);
  const [account, setAccount] = useState<Account>(env.account);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [theme, setTheme] = useState(env.prefs.theme);
  const [hidden, setHidden] = useState(readHidden);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: SidebarTarget } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const handle = useRef<DocHandle | null>(null);
  const busy = useRef(false);
  const gen = useRef(0);
  const dark = theme === "dark";

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 6000);
  }, []);

  const relOf = useCallback((p: string) => (p.startsWith(folder + "/") || p.startsWith(folder + "\\") ? p.slice(folder.length + 1) : p), [folder]);
  const absOf = useCallback((rel: string) => `${folder}/${rel}`, [folder]);

  const commitTabs = useCallback(
    (next: TabsState) => {
      tabsRef.current = next;
      setTabs(next);
      const inside = next.open.filter((p) => relOf(p) !== p);
      void api.folder.setTabs({ dir: folder, open: inside.map(relOf), active: next.active && inside.includes(next.active) ? relOf(next.active) : null });
    },
    [folder, relOf],
  );

  /** Mount the note at `path` in the canvas (fresh prefs and library, which another tab may have changed). */
  const load = useCallback(async (path: string): Promise<boolean> => {
    try {
      const [file, prefs, library] = await Promise.all([api.files.read({ path }), api.app.getPrefs(), api.app.loadLibrary()]);
      gen.current += 1;
      setStatus("saved");
      setCurrent({ doc: { kind: "local", path, recoveryId: null, json: file.json, mtimeMs: file.mtimeMs, recovered: false }, env: { ...env, prefs, library }, gen: gen.current });
      return true;
    } catch (e) {
      showToast(`Tidak bisa membuka: ${errText(e)}`);
      return false;
    }
  }, [env, showToast]);

  /** Apply a tab change; the open note is saved first and the switch is refused if that fails. */
  const go = useCallback(
    async (action: TabsAction, opts: { skipFlush?: boolean } = {}) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const prev = tabsRef.current;
        let next = tabsReducer(prev, action);
        if (next.active !== prev.active && handle.current && !opts.skipFlush) {
          if (!(await handle.current.flush())) {
            showToast("Gagal menyimpan — tab tidak dipindah");
            return;
          }
        }
        while (next.active && next.active !== prev.active && !(await load(next.active))) next = tabsReducer(next, { type: "close", path: next.active });
        if (!next.active) {
          handle.current = null;
          setCurrent(null);
        }
        commitTabs(next);
      } finally {
        busy.current = false;
      }
    },
    [commitTabs, load, showToast],
  );

  const refresh = useCallback(async () => {
    try {
      const list = await api.folder.list({ dir: folder });
      setNotes(list);
      const synced = tabsReducer(tabsRef.current, { type: "sync", existing: list.map((n) => n.path) });
      if (synced.open.length !== tabsRef.current.open.length) commitTabs(synced);
      return list;
    } catch (e) {
      showToast(`Tidak bisa membaca folder: ${errText(e)}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [folder, commitTabs, showToast]);

  // First load: notes plus the tabs remembered for this folder.
  useEffect(() => {
    void (async () => {
      const [list, saved] = await Promise.all([refresh(), api.folder.getTabs({ dir: folder }).catch(() => ({ open: [], active: null }))]);
      if (!list) return;
      const existing = new Set(list.map((n) => n.path));
      const open = saved.open.map(absOf).filter((p) => existing.has(p));
      const wanted = saved.active && open.includes(absOf(saved.active)) ? absOf(saved.active) : (open[0] ?? list[0]?.path ?? null);
      tabsRef.current = { open, active: null };
      if (wanted) await go({ type: "open", path: wanted });
      else commitTabs({ open, active: null });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => api.on("folder:changed", () => void refresh()), [refresh]);

  // Window title and close state when no note is open.
  useEffect(() => {
    if (current) return;
    void api.app.setDocState({ title: `${title} — Sketch Out`, edited: false, untitled: false, nonEmpty: false, recoveryId: null });
  }, [current, title]);

  useEffect(
    () =>
      api.on("menu:command", (payload) => {
        const cmd = payload as MenuCommand;
        const active = tabsRef.current.active;
        if (cmd === "closeTab") {
          if (active) void go({ type: "close", path: active });
          else void api.app.closeWindow();
        } else if (cmd === "nextTab") void go({ type: "next" });
        else if (cmd === "prevTab") void go({ type: "prev" });
      }),
    [go],
  );

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, hidden ? "1" : "0");
    } catch {
      /* storage unavailable: the choice just isn't remembered */
    }
  }, [hidden]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const createNote = async (dir: string, name: string) => {
    setDialog(null);
    try {
      const { path } = await api.folder.create({ dir, name, json: serialize([], {}, {}) });
      await refresh();
      await go({ type: "open", path });
    } catch (e) {
      showToast(`Gagal membuat catatan: ${errText(e)}`);
    }
  };

  const renameNote = async (note: NoteInfo, name: string) => {
    setDialog(null);
    const isActive = tabsRef.current.active === note.path;
    try {
      if (isActive && handle.current && !(await handle.current.flush())) return showToast("Gagal menyimpan — tidak bisa ganti nama");
      const { path } = await api.folder.rename({ path: note.path, name });
      if (path === note.path) return;
      commitTabs(tabsReducer(tabsRef.current, { type: "rename", from: note.path, to: path }));
      await refresh();
      if (isActive) await load(path);
    } catch (e) {
      showToast(`Gagal mengganti nama: ${errText(e)}`);
    }
  };

  const trashNote = async (note: NoteInfo) => {
    setDialog(null);
    const isActive = tabsRef.current.active === note.path;
    // Unmount the editor first so a pending autosave cannot re-create the file.
    if (isActive) {
      handle.current = null;
      setCurrent(null);
    }
    try {
      await api.folder.trash({ path: note.path });
    } catch (e) {
      showToast(`Gagal memindahkan ke Tempat Sampah: ${errText(e)}`);
      if (isActive) await load(note.path);
      return;
    }
    await go({ type: "close", path: note.path }, { skipFlush: true });
    await refresh();
  };

  const onMenu = (e: MouseEvent, target: SidebarTarget) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, target });
  };

  const tree = useMemo(() => buildTree(notes), [notes]);
  const labels = useMemo(() => tabLabels(notes, tabs.open), [notes, tabs.open]);
  const dirty = status !== "saved";
  const onStatus = useCallback((s: SaveStatus) => setStatus(s), []);
  const onPath = useCallback((p: string) => {
    const active = tabsRef.current.active;
    if (active && p !== active) commitTabs(tabsReducer(tabsRef.current, { type: "rename", from: active, to: p }));
  }, [commitTabs]);
  const onReplace = useCallback((d: Doc) => {
    gen.current += 1;
    setCurrent((c) => (c ? { ...c, doc: d, gen: gen.current } : c));
  }, []);

  return (
    <div className={`so-ws${dark ? " so-dark" : ""}`}>
      {!hidden && (
        <Sidebar
          title={title}
          tree={tree}
          loading={loading}
          active={tabs.active}
          dirty={dirty}
          onOpen={(n) => void go({ type: "open", path: n.path })}
          onNew={() => setDialog({ kind: "new", dir: folder })}
          onHide={() => setHidden(true)}
          onMenu={onMenu}
        />
      )}
      <div className="so-main">
        <div className="so-tabs" role="tablist" aria-label="Catatan terbuka">
          {hidden && (
            <button type="button" className="so-icon-btn" title="Tampilkan sidebar" aria-label="Tampilkan sidebar" onClick={() => setHidden(false)}>»</button>
          )}
          {tabs.open.map((p) => {
            const isActive = p === tabs.active;
            return (
              <div key={p} className={`so-tab${isActive ? " is-active" : ""}`} role="tab" aria-selected={isActive} title={relOf(p)}>
                <button type="button" className="so-tab__label" onClick={() => void go({ type: "activate", path: p })}>
                  {labels[p] ?? p}
                  {isActive && dirty && <span className="so-dot" aria-label="Belum tersimpan">●</span>}
                </button>
                <button type="button" className="so-tab__close" aria-label={`Tutup ${labels[p] ?? ""}`} onClick={() => void go({ type: "close", path: p })}>×</button>
              </div>
            );
          })}
        </div>
        <div className="so-canvas">
          {current ? (
            <DocView
              key={`${current.doc.kind === "local" ? current.doc.path : ""}#${current.gen}`}
              doc={current.doc}
              env={current.env}
              account={account}
              setAccount={setAccount}
              onReplace={onReplace}
              handle={handle}
              onStatus={onStatus}
              onPath={onPath}
              onTheme={setTheme}
              titleSuffix={title}
            />
          ) : (
            !loading && <div className="so-empty">{notes.length ? "Pilih catatan di sidebar" : "Buat catatan pertama di folder ini"}</div>
          )}
        </div>
      </div>

      {menu && (
        <div className="so-ctx" style={{ left: menu.x, top: menu.y }} role="menu" onClick={(e) => e.stopPropagation()}>
          {menu.target.kind === "dir" ? (
            <button type="button" role="menuitem" onClick={() => { const rel = (menu.target as { rel: string }).rel; setMenu(null); setDialog({ kind: "new", dir: absOf(rel) }); }}>
              Catatan baru di sini
            </button>
          ) : (
            <>
              <button type="button" role="menuitem" onClick={() => { const note = (menu.target as { note: NoteInfo }).note; setMenu(null); setDialog({ kind: "rename", note }); }}>
                Ganti nama…
              </button>
              <button type="button" role="menuitem" className="is-danger" onClick={() => { const note = (menu.target as { note: NoteInfo }).note; setMenu(null); setDialog({ kind: "trash", note }); }}>
                Pindahkan ke Tempat Sampah
              </button>
            </>
          )}
        </div>
      )}

      {dialog?.kind === "new" && (
        <NameDialog dark={dark} title="Catatan baru" initial="Tanpa judul" confirmLabel="Buat" onCancel={() => setDialog(null)} onConfirm={(name) => void createNote(dialog.dir, name)} />
      )}
      {dialog?.kind === "rename" && (
        <NameDialog dark={dark} title="Ganti nama catatan" initial={dialog.note.name} confirmLabel="Simpan" onCancel={() => setDialog(null)} onConfirm={(name) => void renameNote(dialog.note, name)} />
      )}
      {dialog?.kind === "trash" && (
        <Modal
          dark={dark}
          title="Pindahkan ke Tempat Sampah?"
          actions={[
            { label: "Batal", run: () => setDialog(null) },
            { label: "Pindahkan", primary: true, run: () => void trashNote(dialog.note) },
          ]}
        >
          “{dialog.note.name}” akan dipindahkan ke Tempat Sampah. Kamu masih bisa memulihkannya dari sana.
        </Modal>
      )}
      {toast && (
        <div className={`so-toast${dark ? " so-dark" : ""}`} role="status">
          <span>{toast}</span>
          <button type="button" className="so-icon-btn" aria-label="Tutup" onClick={() => setToast(null)}>×</button>
        </div>
      )}
    </div>
  );
}
