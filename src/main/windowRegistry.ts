import type { DocRef } from "@shared/types";
import { pathKey } from "@shared/paths";

export function docKey(doc: DocRef): string | null {
  if (doc.kind === "local") return doc.path ? `local:${pathKey(doc.path)}` : null;
  return `drive:${doc.localId}`;
}

interface Win {
  focus(): void;
  restore(): void;
  isMinimized(): boolean;
  isDestroyed(): boolean;
  once(ev: "closed", cb: () => void): unknown;
}

/** One window per document: opening an already-open document focuses its window. */
export class WindowRegistry<W extends Win> {
  private byKey = new Map<string, W>();
  private keyOf = new Map<W, string>();
  private tracked = new WeakSet<W>();

  constructor(private create: (doc: DocRef) => W) {}

  find(doc: DocRef): W | null {
    const k = docKey(doc);
    const w = k ? this.byKey.get(k) : undefined;
    return w && !w.isDestroyed() ? w : null;
  }

  openDocument(doc: DocRef): W {
    const existing = this.find(doc);
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return existing;
    }
    const w = this.create(doc);
    this.rekey(w, doc);
    return w;
  }

  rekey(w: W, doc: DocRef): void {
    if (!this.tracked.has(w)) {
      this.tracked.add(w);
      w.once("closed", () => {
        const k = this.keyOf.get(w);
        if (k && this.byKey.get(k) === w) this.byKey.delete(k);
        this.keyOf.delete(w);
      });
    }
    const old = this.keyOf.get(w);
    if (old) this.byKey.delete(old);
    const k = docKey(doc);
    if (k) {
      this.byKey.set(k, w);
      this.keyOf.set(w, k);
    } else this.keyOf.delete(w);
  }
}
