import { useEffect, useState } from "react";
import type { InitialDoc, Prefs } from "../preload/api";
import { LocalEditor, type LocalDoc } from "./LocalEditor";

const api = window.sketchOut;

async function boot(): Promise<LocalDoc> {
  const init: InitialDoc = await api.app.getInitialDoc();
  const doc = init.doc;
  if (doc?.kind === "local" && doc.path) {
    const { json, mtimeMs } = await api.files.read({ path: doc.path });
    return { path: doc.path, recoveryId: null, json, mtimeMs, recovered: false };
  }
  const json = init.recoveryId && init.recovered ? await api.files.readRecovery({ recoveryId: init.recoveryId }) : null;
  return { path: null, recoveryId: init.recoveryId, json, mtimeMs: null, recovered: init.recovered && !!json };
}

export interface Env {
  prefs: Prefs;
  library: unknown[];
}

export default function App() {
  const [state, setState] = useState<{ doc: LocalDoc; env: Env } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([boot(), api.app.getPrefs(), api.app.loadLibrary()]).then(
      ([doc, prefs, library]) => setState({ doc, env: { prefs, library } }),
      (e) => setError(String(e?.message ?? e)),
    );
  }, []);
  if (error) return <div style={{ padding: 24, fontFamily: "system-ui" }}>Gagal membuka dokumen: {error}</div>;
  if (!state) return null;
  return <LocalEditor initial={state.doc} env={state.env} />;
}
