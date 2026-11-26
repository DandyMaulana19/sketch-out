import { describe, it, expect, vi } from "vitest";
import { WindowRegistry, docKey } from "../../src/main/windowRegistry";

class FakeWin {
  focus = vi.fn();
  restore = vi.fn();
  isMinimized = () => false;
  isDestroyed = () => false;
  private closed: (() => void)[] = [];
  once(ev: "closed", cb: () => void) { if (ev === "closed") this.closed.push(cb); }
  close() { this.closed.forEach((c) => c()); }
}

describe("docKey", () => {
  it("keys local docs by path and drive docs by localId", () => {
    expect(docKey({ kind: "local", path: "/a.excalidraw" })).toBe("local:/a.excalidraw");
    expect(docKey({ kind: "local", path: null })).toBeNull();
    expect(docKey({ kind: "drive", localId: "L1", fileId: "F1" })).toBe("drive:L1");
  });
});

describe("WindowRegistry", () => {
  it("opening the same document twice focuses the existing window", () => {
    const create = vi.fn(() => new FakeWin());
    const reg = new WindowRegistry<FakeWin>(create);
    const doc = { kind: "drive" as const, fileId: "f1", localId: "a" };
    const w1 = reg.openDocument(doc);
    const w2 = reg.openDocument(doc);
    expect(w2).toBe(w1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(w1.focus).toHaveBeenCalled();
  });
  it("closing a window forgets its key", () => {
    const reg = new WindowRegistry<FakeWin>(() => new FakeWin());
    const doc = { kind: "local" as const, path: "/x.excalidraw" };
    const w = reg.openDocument(doc);
    w.close();
    expect(reg.find(doc)).toBeNull();
  });
  it("re-keys a window when its document identity changes (e.g. Save as)", () => {
    const reg = new WindowRegistry<FakeWin>(() => new FakeWin());
    const w = reg.openDocument({ kind: "local", path: null });
    reg.rekey(w, { kind: "local", path: "/saved.excalidraw" });
    expect(reg.find({ kind: "local", path: "/saved.excalidraw" })).toBe(w);
  });
  it("untitled documents always get a new window", () => {
    const create = vi.fn(() => new FakeWin());
    const reg = new WindowRegistry<FakeWin>(create);
    reg.openDocument({ kind: "local", path: null });
    reg.openDocument({ kind: "local", path: null });
    expect(create).toHaveBeenCalledTimes(2);
  });
  it("forgets windows that were created outside the registry once they close", () => {
    const reg = new WindowRegistry<FakeWin>(() => new FakeWin());
    const w = new FakeWin();
    reg.rekey(w, { kind: "local", path: "/y.excalidraw" });
    w.close();
    expect(reg.find({ kind: "local", path: "/y.excalidraw" })).toBeNull();
  });
});
