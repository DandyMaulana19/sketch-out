/** Pure scene helpers behind the AI's canvas operations (no Excalidraw runtime needed, so they are unit-tested). */
export interface El {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  text?: string;
  originalText?: string;
  containerId?: string | null;
  boundElements?: { id: string; type: string }[] | null;
  startBinding?: { elementId: string } & Record<string, unknown> | null;
  endBinding?: { elementId: string } & Record<string, unknown> | null;
  [key: string]: unknown;
}
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Update {
  id: string;
  [key: string]: unknown;
}

const ALLOWED = new Set([
  "x", "y", "width", "height", "angle", "strokeColor", "backgroundColor", "fillStyle", "strokeWidth", "strokeStyle", "roughness", "opacity", "fontSize",
]);

const nonce = () => Math.floor(Math.random() * 2 ** 31);
const bump = (e: El, patch: Partial<El>): El => ({ ...e, ...patch, version: e.version + 1, versionNonce: nonce(), updated: Date.now() });

function bounds(boxes: Box[]) {
  return {
    minX: Math.min(...boxes.map((b) => b.x)),
    minY: Math.min(...boxes.map((b) => b.y)),
    maxY: Math.max(...boxes.map((b) => b.y + b.height)),
  };
}

/** Offset that moves `added` below the existing content (left-aligned with it); none on an empty canvas. */
export function placeBelow(existing: Box[], added: Box[], gap = 80): { dx: number; dy: number } {
  if (!existing.length || !added.length) return { dx: 0, dy: 0 };
  const e = bounds(existing);
  const a = bounds(added);
  return { dx: e.minX - a.minX, dy: e.maxY + gap - a.minY };
}

const boundTextOf = (els: El[], container: El) => {
  const id = container.boundElements?.find((b) => b.type === "text")?.id;
  return id ? els.find((e) => e.id === id && e.type === "text") : undefined;
};

export function applyUpdates(elements: El[], updates: Update[]): { elements: El[]; missing: string[] } {
  const out = elements.map((e) => ({ ...e }));
  const index = new Map(out.map((e, i) => [e.id, i]));
  const missing: string[] = [];
  for (const u of updates) {
    const i = index.get(u.id);
    if (i === undefined || out[i].isDeleted) {
      missing.push(u.id);
      continue;
    }
    const patch: Partial<El> = {};
    for (const [k, v] of Object.entries(u)) if (ALLOWED.has(k) && v !== undefined) patch[k] = v;
    if (typeof u.text === "string") {
      const target = out[i].type === "text" ? out[i] : boundTextOf(out, out[i]);
      if (target) {
        const j = index.get(target.id)!;
        out[j] = bump(out[j], { text: u.text, originalText: u.text });
      }
    }
    if (Object.keys(patch).length) out[i] = bump(out[i], patch);
  }
  return { elements: out, missing };
}

export function markDeleted(elements: El[], ids: string[]): { elements: El[]; missing: string[] } {
  const known = new Set(elements.filter((e) => !e.isDeleted).map((e) => e.id));
  const missing = ids.filter((id) => !known.has(id));
  const gone = new Set(ids.filter((id) => known.has(id)));
  // Bound labels go with their shape.
  for (const e of elements) if (e.containerId && gone.has(e.containerId)) gone.add(e.id);
  const out = elements.map((e) => {
    if (gone.has(e.id)) return bump(e, { isDeleted: true });
    const start = e.startBinding && gone.has(e.startBinding.elementId);
    const end = e.endBinding && gone.has(e.endBinding.elementId);
    const bound = e.boundElements?.some((b) => gone.has(b.id));
    if (!start && !end && !bound) return e;
    const patch: Partial<El> = {};
    if (start) patch.startBinding = null;
    if (end) patch.endBinding = null;
    if (bound) patch.boundElements = e.boundElements!.filter((b) => !gone.has(b.id));
    return bump(e, patch);
  });
  return { elements: out, missing };
}

/** Straight arrow from the edge of `a` to the edge of `b` (centre to centre, clipped to each box plus `gap`). */
export function routeArrow(a: Box, b: Box, gap = 8): { x: number; y: number; width: number; height: number; points: [number, number][] } {
  const c1 = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
  const c2 = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const exit = (box: Box) => Math.min(ux ? box.width / 2 / Math.abs(ux) : Infinity, uy ? box.height / 2 / Math.abs(uy) : Infinity);
  const t1 = exit(a) + gap;
  const t2 = exit(b) + gap;
  const r = (n: number) => Math.round(n * 100) / 100 + 0; // + 0 turns -0 into 0
  const x = r(c1.x + ux * t1);
  const y = r(c1.y + uy * t1);
  const ex = r(c2.x - ux * t2 - x);
  const ey = r(c2.y - uy * t2 - y);
  return { x, y, width: Math.abs(ex), height: Math.abs(ey), points: [[0, 0], [ex, ey]] };
}

/** Give labelled shapes without a size room for their text (Excalidraw would otherwise use a small default box). */
export function sizeForLabel<T extends Record<string, unknown>>(s: T): T & { width?: number; height?: number } {
  const text = (s.label as { text?: string } | undefined)?.text;
  if (!text || s.type === "text" || s.type === "arrow" || s.type === "line") return s;
  const lines = text.split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  return {
    ...s,
    width: s.width ?? Math.max(160, Math.round(longest * 11 + 60)),
    height: s.height ?? Math.max(70, lines.length * 30 + 40),
  } as T & { width?: number; height?: number };
}
