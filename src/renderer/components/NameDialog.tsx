import { useState } from "react";
import { Modal } from "./Modal";

export function NameDialog({ title, initial, confirmLabel, dark, onCancel, onConfirm }: { title: string; initial: string; confirmLabel: string; dark: boolean; onCancel(): void; onConfirm(name: string): void }) {
  const [value, setValue] = useState(initial);
  const submit = () => value.trim() && onConfirm(value.trim());
  return (
    <Modal dark={dark} title={title} actions={[{ label: "Batal", run: onCancel }, { label: confirmLabel, primary: true, run: submit }]}>
      <input
        className="so-input"
        autoFocus
        aria-label="Nama"
        value={value}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") onCancel();
        }}
      />
    </Modal>
  );
}
