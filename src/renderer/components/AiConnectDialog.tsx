import { useEffect, useState } from "react";
import type { AiClientId, AiClientInfo } from "../../preload/api";

const api = window.sketchOut;
const errText = (e: unknown) => String((e as Error)?.message ?? e).split(": ").slice(1).join(": ") || String(e);

const STATUS: Record<AiClientInfo["status"], string> = {
  missing: "Tidak terdeteksi",
  available: "Belum terhubung",
  connected: "Terhubung ✓",
  outdated: "Perlu diperbarui",
  unreadable: "Pengaturan tidak bisa dibaca",
};

interface Props {
  dark: boolean;
  onClose(): void;
  onToast(message: string): void;
}

export function AiConnectDialog({ dark, onClose, onToast }: Props) {
  const [clients, setClients] = useState<AiClientInfo[] | null>(null);
  const [busy, setBusy] = useState<AiClientId | null>(null);
  const [notes, setNotes] = useState<Partial<Record<AiClientId, string>>>({});

  useEffect(() => {
    void api.ai.clients().then(setClients, (e) => {
      onToast(`Gagal memeriksa AI: ${errText(e)}`);
      setClients([]);
    });
  }, [onToast]);

  const run = async (c: AiClientInfo, action: "connect" | "disconnect") => {
    setBusy(c.id);
    try {
      const next = await (action === "connect" ? api.ai.connect({ id: c.id }) : api.ai.disconnect({ id: c.id }));
      setClients((list) => list?.map((x) => (x.id === c.id ? next : x)) ?? null);
      setNotes((n) => ({ ...n, [c.id]: action === "connect" && next.status === "connected" ? (c.restartNote ?? "") : "" }));
    } catch (e) {
      onToast(errText(e));
    } finally {
      setBusy(null);
    }
  };

  const copy = async (kind: "command" | "json") => {
    await api.ai.copyConfig({ kind });
    onToast(kind === "command" ? "Perintah disalin" : "JSON disalin");
  };

  return (
    <div className={`so-modal-backdrop${dark ? " so-dark" : ""}`} role="dialog" aria-modal="true" aria-label="Hubungkan ke AI" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="so-modal so-ai">
        <div className="so-drive__head">
          <h2 className="so-modal__title">Hubungkan ke AI</h2>
          <button type="button" className="so-icon-btn" aria-label="Tutup" onClick={onClose}>×</button>
        </div>
        <p className="so-modal__body">
          AI yang terhubung bisa membaca dan menggambar di catatan yang kamu buka di Sketch Out, dan hasilnya langsung muncul di kanvas. AI tidak bisa membuka file di luar folder atau file yang kamu buka. Sketch Out akan terbuka sendiri saat dipanggil AI.
        </p>
        <ul className="so-ai__list">
          {clients === null && <li className="so-drive__empty">Memeriksa AI yang terpasang…</li>}
          {clients?.map((c) => (
            <li key={c.id} className={`so-ai__row is-${c.status}`}>
              <div className="so-ai__info">
                <span className="so-ai__name">{c.label}</span>
                <span className="so-ai__status">{busy === c.id ? "Memproses…" : STATUS[c.status]}</span>
                {notes[c.id] && <span className="so-ai__note">{notes[c.id]}</span>}
              </div>
              {c.status === "connected" ? (
                <button type="button" className="so-btn" disabled={busy !== null} onClick={() => void run(c, "disconnect")}>Putuskan</button>
              ) : (
                <button
                  type="button"
                  className="so-btn so-btn--primary"
                  disabled={busy !== null || c.status === "missing" || c.status === "unreadable"}
                  onClick={() => void run(c, "connect")}
                >
                  {c.status === "outdated" ? "Perbarui" : "Hubungkan"}
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="so-ai__other">
          <span>AI lain yang mendukung MCP:</span>
          <button type="button" className="so-btn" onClick={() => void copy("command")}>Salin perintah</button>
          <button type="button" className="so-btn" onClick={() => void copy("json")}>Salin JSON</button>
        </div>
      </div>
    </div>
  );
}
