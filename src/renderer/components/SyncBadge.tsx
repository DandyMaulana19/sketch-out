import type { SyncState } from "../../shared/types";
export type BadgeTone = "ok" | "busy" | "offline" | "error";
export interface BadgeView {
  tone: BadgeTone;
  label: string;
  action?: { label: string; run(): void };
  onClick?: () => void;
}

const DOT: Record<BadgeTone, string> = { ok: "✓", busy: "⟳", offline: "●", error: "⚠" };

export function SyncBadge({ view }: { view: BadgeView }) {
  return (
    <div className={`so-badge so-badge--${view.tone}`} role="status" aria-live="polite">
      <button type="button" className="so-badge__main" onClick={view.onClick} disabled={!view.onClick} title={view.label}>
        <span className="so-badge__dot" aria-hidden>{DOT[view.tone]}</span>
        <span className="so-badge__label">{view.label}</span>
      </button>
      {view.action && (
        <button type="button" className="so-badge__action" onClick={view.action.run}>
          {view.action.label}
        </button>
      )}
    </div>
  );
}

export function localBadge(status: "saved" | "saving" | "pending" | "error", error: string | null, untitled: boolean): BadgeView {
  if (status === "error") return { tone: "error", label: error ?? "Gagal menyimpan" };
  if (status === "saving" || status === "pending") return { tone: "busy", label: "Menyimpan…" };
  return { tone: "ok", label: untitled ? "Belum disimpan ke file" : "Tersimpan" };
}

export function driveBadge(state: SyncState, actions: { syncNow(): void; signIn(): void }): BadgeView {
  switch (state.status) {
    case "synced":
      return { tone: "ok", label: "Tersimpan ke Drive", onClick: actions.syncNow };
    case "pending":
    case "syncing":
      return { tone: "busy", label: "Menyinkron…" };
    case "offline":
      return { tone: "offline", label: "Offline — tersimpan di perangkat", onClick: actions.syncNow };
    case "conflict":
      return { tone: "error", label: "Konflik", onClick: actions.syncNow };
    case "error":
      if (state.error === "Perlu login ulang") return { tone: "error", label: "Perlu login ulang", action: { label: "Login ulang", run: actions.signIn } };
      return { tone: "error", label: state.error ?? "Gagal menyinkron", onClick: actions.syncNow, action: { label: "Coba lagi", run: actions.syncNow } };
  }
}
