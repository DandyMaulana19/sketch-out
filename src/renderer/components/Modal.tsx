import type { ReactNode } from "react";

export interface ModalAction {
  label: string;
  primary?: boolean;
  run(): void;
}

export function Modal({ title, children, actions, dark }: { title: string; children: ReactNode; actions: ModalAction[]; dark: boolean }) {
  return (
    <div className={`so-modal-backdrop${dark ? " so-dark" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="so-modal">
        <h2 className="so-modal__title">{title}</h2>
        <div className="so-modal__body">{children}</div>
        <div className="so-modal__actions">
          {actions.map((a) => (
            <button key={a.label} type="button" className={`so-btn${a.primary ? " so-btn--primary" : ""}`} onClick={a.run}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
