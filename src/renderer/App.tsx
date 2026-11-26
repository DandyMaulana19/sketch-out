import { useEffect, useState } from "react";
import type { InitialDoc } from "../preload/api";
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

export default function App() {
  const [doc, setDoc] = useState<LocalDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    boot().then(setDoc, (e) => setError(String(e?.message ?? e)));
  }, []);
  if (error) return <div style={{ padding: 24, fontFamily: "system-ui" }}>Gagal membuka dokumen: {error}</div>;
  if (!doc) return null;
  return <LocalEditor initial={doc} />;
}
