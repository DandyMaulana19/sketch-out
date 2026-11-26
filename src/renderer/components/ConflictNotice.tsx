import type { SyncNotice } from "../../shared/types";

export function ConflictNotice({ notice, dark, onOpenOriginal, onDismiss }: { notice: SyncNotice; dark: boolean; onOpenOriginal(): void; onDismiss(): void }) {
  const isCopy = notice.copyName.includes("(konflik ");
  return (
    <div className={`so-toast${dark ? " so-dark" : ""}`} role="alert">
      <span>
        {isCopy
          ? <>File di Drive diubah di tempat lain. Perubahanmu disimpan sebagai “{notice.copyName}”.</>
          : <>File di Drive sudah tidak ada, jadi dibuat ulang sebagai “{notice.copyName}”.</>}
      </span>
      {isCopy && <button type="button" className="so-btn" onClick={onOpenOriginal}>Buka versi Drive</button>}
      <button type="button" className="so-btn" onClick={onDismiss}>Tutup</button>
    </div>
  );
}
