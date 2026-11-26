import { useEffect, useState } from "react";
import type { Prefs } from "../preload/api";
import { Editor } from "./Editor";
import { FolderWorkspace } from "./folder/FolderWorkspace";
import type { Doc } from "./doc/types";

const api = window.sketchOut;

export interface Account {
  signedIn: boolean;
  email: string | null;
}
export interface Env {
  prefs: Prefs;
  library: unknown[];
  account: Account;
}

type Boot = { folder: string } | { doc: Doc };

async function boot(): Promise<Boot> {
  const init = await api.app.getInitialDoc();
  if (init.folder) return { folder: init.folder };
  return { doc: await bootDoc(init) };
}

async function bootDoc(init: Awaited<ReturnType<typeof api.app.getInitialDoc>>): Promise<Doc> {
  const doc = init.doc;
  if (doc?.kind === "drive") {
    const d = await api.drive.readCached({ localId: doc.localId });
    return { kind: "drive", ...d };
  }
  if (doc?.kind === "local" && doc.path) {
    const { json, mtimeMs } = await api.files.read({ path: doc.path });
    return { kind: "local", path: doc.path, recoveryId: null, json, mtimeMs, recovered: false };
  }
  const json = init.recoveryId && init.recovered ? await api.files.readRecovery({ recoveryId: init.recoveryId }) : null;
  return { kind: "local", path: null, recoveryId: init.recoveryId, json, mtimeMs: null, recovered: init.recovered && !!json };
}

export default function App() {
  const [state, setState] = useState<{ boot: Boot; env: Env } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([boot(), api.app.getPrefs(), api.app.loadLibrary(), api.auth.status()]).then(
      ([b, prefs, library, account]) => setState({ boot: b, env: { prefs, library, account } }),
      (e) => setError(String(e?.message ?? e)),
    );
  }, []);
  if (error) return <div style={{ padding: 24, fontFamily: "system-ui" }}>Gagal membuka dokumen: {error}</div>;
  if (!state) return null;
  if ("folder" in state.boot) return <FolderWorkspace folder={state.boot.folder} env={state.env} />;
  return <Editor initial={state.boot.doc} env={state.env} />;
}
