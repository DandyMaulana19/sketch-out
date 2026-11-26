import { useCallback, useEffect, useState } from "react";
import type { DriveFileInfo } from "../../shared/types";

const api = window.sketchOut;
const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"]];
  let v = diff;
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
    v /= n;
  }
  return rtf.format(Math.round(v), "year");
}

interface Props {
  dark: boolean;
  currentFileId: string | null;
  onClose(): void;
  onOpen(fileId: string): void;
  onNew(): void;
  onError(message: string): void;
}

export function DriveDialog({ dark, currentFileId, onClose, onOpen, onNew, onError }: Props) {
  const [files, setFiles] = useState<DriveFileInfo[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [confirmTrash, setConfirmTrash] = useState<DriveFileInfo | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.drive.list();
      setFiles(r.files);
      setOffline(r.offline);
    } catch (e) {
      onError(String((e as Error).message).split(": ").pop() ?? "Gagal memuat daftar Drive");
      setFiles([]);
    }
  }, [onError]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !renaming && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, renaming]);

  const commitRename = async () => {
    if (!renaming) return;
    const value = renaming.value.trim();
    setRenaming(null);
    if (!value) return;
    try {
      await api.drive.rename({ fileId: renaming.id, name: value });
      await load();
    } catch (e) {
      onError(`Gagal mengganti nama: ${String((e as Error).message).split(": ").pop()}`);
    }
  };

  const doTrash = async (f: DriveFileInfo) => {
    setConfirmTrash(null);
    try {
      await api.drive.trash({ fileId: f.id });
      await load();
    } catch (e) {
      onError(`Gagal memindahkan ke sampah: ${String((e as Error).message).split(": ").pop()}`);
    }
  };

  return (
    <div className={`so-modal-backdrop${dark ? " so-dark" : ""}`} role="dialog" aria-modal="true" aria-label="Google Drive" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="so-modal so-drive">
        <div className="so-drive__head">
          <h2 className="so-modal__title">Google Drive</h2>
          <button type="button" className="so-btn so-btn--primary" onClick={onNew}>
            Baru di Drive
          </button>
          <button type="button" className="so-icon-btn" aria-label="Tutup" onClick={onClose}>✕</button>
        </div>
        {offline && <div className="so-banner">Offline — menampilkan daftar terakhir</div>}
        <div className="so-drive__list" role="list">
          {files === null && <div className="so-drive__empty">Memuat…</div>}
          {files?.length === 0 && <div className="so-drive__empty">Belum ada gambar di folder “Sketch Out”.</div>}
          {files?.map((f) => (
            <div key={f.id} role="listitem" className={`so-drive__row${f.id === currentFileId ? " is-current" : ""}`}>
              {renaming?.id === f.id ? (
                <input
                  className="so-input"
                  autoFocus
                  value={renaming.value}
                  onChange={(e) => setRenaming({ id: f.id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitRename();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                  onBlur={() => void commitRename()}
                />
              ) : (
                <button type="button" className="so-drive__open" onClick={() => onOpen(f.id)}>
                  <span className="so-drive__name">{f.name}</span>
                  <span className="so-drive__time">{relativeTime(f.modifiedTime)}</span>
                </button>
              )}
              <button type="button" className="so-icon-btn" title="Ganti nama" aria-label={`Ganti nama ${f.name}`} disabled={offline} onClick={() => setRenaming({ id: f.id, value: f.name })}>✎</button>
              <button type="button" className="so-icon-btn" title="Pindahkan ke sampah" aria-label={`Pindahkan ${f.name} ke sampah`} disabled={offline} onClick={() => setConfirmTrash(f)}>🗑</button>
            </div>
          ))}
        </div>
        {confirmTrash && (
          <div className="so-confirm">
            <span>Pindahkan “{confirmTrash.name}” ke sampah Google Drive? File masih bisa dipulihkan dari sampah Drive.</span>
            <div className="so-modal__actions">
              <button type="button" className="so-btn" onClick={() => setConfirmTrash(null)}>Batal</button>
              <button type="button" className="so-btn so-btn--danger" onClick={() => void doTrash(confirmTrash)}>Pindahkan ke sampah</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
