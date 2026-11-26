import { describe, it, expect } from "vitest";
import { buildTree, tabLabels, tabsReducer, type TabsState } from "../../src/renderer/folder/tabs";
import type { NoteInfo } from "../../src/shared/types";

const s = (open: string[], active: string | null): TabsState => ({ open, active });
const note = (rel: string): NoteInfo => ({ rel, path: `/r/${rel}`, name: rel.split("/").pop()!.replace(/\.excalidraw$/, ""), mtimeMs: 1 });

describe("tabsReducer", () => {
  it("opens at the end and activates; reopening only activates", () => {
    let st = tabsReducer(s([], null), { type: "open", path: "a" });
    st = tabsReducer(st, { type: "open", path: "b" });
    expect(st).toEqual(s(["a", "b"], "b"));
    expect(tabsReducer(st, { type: "open", path: "a" })).toEqual(s(["a", "b"], "a"));
  });

  it("closing the active tab activates the right neighbour, or the left one at the end", () => {
    expect(tabsReducer(s(["a", "b", "c"], "b"), { type: "close", path: "b" })).toEqual(s(["a", "c"], "c"));
    expect(tabsReducer(s(["a", "b", "c"], "c"), { type: "close", path: "c" })).toEqual(s(["a", "b"], "b"));
    expect(tabsReducer(s(["a", "b"], "a"), { type: "close", path: "b" })).toEqual(s(["a"], "a"));
    expect(tabsReducer(s(["a"], "a"), { type: "close", path: "a" })).toEqual(s([], null));
  });

  it("next/prev wrap around", () => {
    expect(tabsReducer(s(["a", "b", "c"], "c"), { type: "next" }).active).toBe("a");
    expect(tabsReducer(s(["a", "b", "c"], "a"), { type: "prev" }).active).toBe("c");
    expect(tabsReducer(s([], null), { type: "next" })).toEqual(s([], null));
  });

  it("rename replaces the path in open and active", () => {
    expect(tabsReducer(s(["a", "b"], "a"), { type: "rename", from: "a", to: "z" })).toEqual(s(["z", "b"], "z"));
  });

  it("sync drops tabs whose file is gone, except the active one", () => {
    expect(tabsReducer(s(["a", "b", "c"], "a"), { type: "sync", existing: ["c"] })).toEqual(s(["a", "c"], "a"));
  });
});

describe("buildTree", () => {
  it("lists folders first, then notes, each sorted by name; only folders holding notes appear", () => {
    const tree = buildTree([note("b.excalidraw"), note("riset/2026/w.excalidraw"), note("a.excalidraw"), note("riset/ide.excalidraw"), note("alpha/x.excalidraw")]);
    const shape = (nodes: ReturnType<typeof buildTree>): unknown =>
      nodes.map((n) => (n.type === "dir" ? { [n.name]: shape(n.children) } : n.note.name));
    expect(shape(tree)).toEqual([{ alpha: ["x"] }, { riset: [{ "2026": ["w"] }, "ide"] }, "a", "b"]);
    const riset = tree[1];
    expect(riset.type === "dir" && riset.rel).toBe("riset");
  });
});

describe("tabLabels", () => {
  it("uses the file name, adding the folder only when two open tabs share a name", () => {
    const notes = [note("ide.excalidraw"), note("riset/ide.excalidraw"), note("alur.excalidraw")];
    const labels = tabLabels(notes, notes.map((n) => n.path));
    expect(labels["/r/alur.excalidraw"]).toBe("alur");
    expect(labels["/r/riset/ide.excalidraw"]).toBe("ide — riset");
    expect(labels["/r/ide.excalidraw"]).toBe("ide");
  });
});
