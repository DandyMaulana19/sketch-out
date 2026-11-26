import { useState, type MouseEvent } from "react";
import type { NoteInfo } from "../../shared/types";
import type { TreeNode } from "./tabs";

export type SidebarTarget = { kind: "note"; note: NoteInfo } | { kind: "dir"; rel: string };

interface Props {
  title: string;
  tree: TreeNode[];
  loading: boolean;
  active: string | null;
  dirty: boolean;
  onOpen(note: NoteInfo): void;
  onNew(): void;
  onHide(): void;
  onMenu(e: MouseEvent, target: SidebarTarget): void;
}

export function Sidebar({ title, tree, loading, active, dirty, onOpen, onNew, onHide, onMenu }: Props) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (rel: string) =>
    setClosed((s) => {
      const n = new Set(s);
      if (n.has(rel)) n.delete(rel);
      else n.add(rel);
      return n;
    });

  const render = (nodes: TreeNode[], depth: number) =>
    nodes.map((n) => {
      const pad = { paddingLeft: 10 + depth * 14 };
      if (n.type === "dir") {
        const open = !closed.has(n.rel);
        return (
          <li key={`d:${n.rel}`}>
            <button type="button" className="so-tree__row so-tree__dir" style={pad} onClick={() => toggle(n.rel)} onContextMenu={(e) => onMenu(e, { kind: "dir", rel: n.rel })} aria-expanded={open}>
              <span className={`so-tree__caret${open ? " is-open" : ""}`} aria-hidden>›</span>
              <span className="so-tree__name">{n.name}</span>
            </button>
            {open && <ul>{render(n.children, depth + 1)}</ul>}
          </li>
        );
      }
      const isActive = n.note.path === active;
      const notePad = { paddingLeft: 26 + depth * 14 }; // line up with folder names (past the caret)
      return (
        <li key={n.note.path}>
          <button
            type="button"
            className={`so-tree__row so-tree__note${isActive ? " is-active" : ""}`}
            style={notePad}
            title={n.note.rel}
            data-rel={n.note.rel}
            onClick={() => onOpen(n.note)}
            onContextMenu={(e) => onMenu(e, { kind: "note", note: n.note })}
          >
            <span className="so-tree__name">{n.note.name}</span>
            {isActive && dirty && <span className="so-dot" aria-label="Belum tersimpan">●</span>}
          </button>
        </li>
      );
    });

  return (
    <aside className="so-side" aria-label="Catatan di folder">
      <div className="so-side__head">
        <span className="so-side__title" title={title}>{title}</span>
        <button type="button" className="so-icon-btn" title="Catatan baru" aria-label="Catatan baru" onClick={onNew}>+</button>
        <button type="button" className="so-icon-btn" title="Sembunyikan sidebar" aria-label="Sembunyikan sidebar" onClick={onHide}>«</button>
      </div>
      <ul className="so-tree">
        {render(tree, 0)}
      </ul>
      {!loading && tree.length === 0 && (
        <div className="so-side__empty">
          Belum ada catatan di folder ini.
          <button type="button" className="so-btn so-btn--primary" onClick={onNew}>+ Catatan baru</button>
        </div>
      )}
    </aside>
  );
}
