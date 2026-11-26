import type { NoteInfo } from "../../shared/types";

/** Open tabs of a folder window, as absolute note paths. */
export interface TabsState {
  open: string[];
  active: string | null;
}

export type TabsAction =
  | { type: "open" | "close" | "activate"; path: string }
  | { type: "next" | "prev" }
  | { type: "rename"; from: string; to: string }
  | { type: "sync"; existing: string[] }
  | { type: "reset"; state: TabsState };

export function tabsReducer(s: TabsState, a: TabsAction): TabsState {
  switch (a.type) {
    case "open":
      return s.open.includes(a.path) ? { ...s, active: a.path } : { open: [...s.open, a.path], active: a.path };
    case "activate":
      return s.open.includes(a.path) ? { ...s, active: a.path } : s;
    case "close": {
      const i = s.open.indexOf(a.path);
      if (i < 0) return s;
      const open = s.open.filter((p) => p !== a.path);
      if (s.active !== a.path) return { ...s, open };
      return { open, active: open[i] ?? open[i - 1] ?? null };
    }
    case "next":
    case "prev": {
      if (!s.open.length) return s;
      const i = s.active ? s.open.indexOf(s.active) : -1;
      const n = s.open.length;
      return { ...s, active: s.open[(i + (a.type === "next" ? 1 : -1) + n) % n] };
    }
    case "rename":
      return { open: s.open.map((p) => (p === a.from ? a.to : p)), active: s.active === a.from ? a.to : s.active };
    case "sync": {
      const keep = new Set(a.existing);
      return { ...s, open: s.open.filter((p) => keep.has(p) || p === s.active) };
    }
    case "reset":
      return a.state;
  }
}

export type TreeNode = { type: "dir"; name: string; rel: string; children: TreeNode[] } | { type: "note"; note: NoteInfo };

const collator = new Intl.Collator("id", { numeric: true, sensitivity: "base" });

/** Folder tree built from the notes, so only folders that (somewhere below) hold a note appear. */
export function buildTree(notes: NoteInfo[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode[]>([["", root]]);
  const dirOf = (rel: string): TreeNode[] => {
    const hit = dirs.get(rel);
    if (hit) return hit;
    const cut = rel.lastIndexOf("/");
    const parent = dirOf(cut < 0 ? "" : rel.slice(0, cut));
    const children: TreeNode[] = [];
    parent.push({ type: "dir", name: rel.slice(cut + 1), rel, children });
    dirs.set(rel, children);
    return children;
  };
  for (const n of notes) {
    const cut = n.rel.lastIndexOf("/");
    dirOf(cut < 0 ? "" : n.rel.slice(0, cut)).push({ type: "note", note: n });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      const an = a.type === "dir" ? a.name : a.note.name;
      const bn = b.type === "dir" ? b.name : b.note.name;
      return collator.compare(an, bn);
    });
    for (const n of nodes) if (n.type === "dir") sort(n.children);
  };
  sort(root);
  return root;
}

const nameOf = (path: string) => path.split(/[\\/]/).pop()!.replace(/\.excalidraw$/i, "");

/** Tab captions: the note name, plus its folder when two open tabs share a name. */
export function tabLabels(notes: NoteInfo[], open: string[]): Record<string, string> {
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const count = new Map<string, number>();
  for (const p of open) count.set(nameOf(p), (count.get(nameOf(p)) ?? 0) + 1);
  const out: Record<string, string> = {};
  for (const p of open) {
    const name = nameOf(p);
    const rel = byPath.get(p)?.rel ?? "";
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    out[p] = (count.get(name) ?? 0) > 1 && dir ? `${name} — ${dir}` : name;
  }
  return out;
}
