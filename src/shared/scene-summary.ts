/** Compact, AI-friendly view of an Excalidraw scene (what `read_note` returns). */
export interface SummaryEl {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  text?: string;
  label?: string;
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: string;
  strokeWidth?: number;
  start?: string;
  end?: string;
  groupIds?: string[];
  frameId?: string;
}

type Raw = Record<string, unknown>;
const DEFAULTS: Record<string, unknown> = { strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2 };
const num = (v: unknown) => Math.round(Number(v) || 0);

export function summarize(elements: unknown[], limit = 2000): { count: number; truncated: boolean; elements: SummaryEl[] } {
  const live = (elements as Raw[]).filter((e) => e && !e.isDeleted);
  const byId = new Map(live.map((e) => [e.id as string, e]));
  // Text bound to a container becomes that container's label.
  const labels = new Map<string, string>();
  for (const e of live) if (e.type === "text" && typeof e.containerId === "string" && byId.has(e.containerId)) labels.set(e.containerId, String(e.text ?? ""));
  const shown = live.filter((e) => !(e.type === "text" && typeof e.containerId === "string" && byId.has(e.containerId)));
  const out: SummaryEl[] = shown.slice(0, limit).map((e) => {
    const s: SummaryEl = { id: String(e.id), type: String(e.type), x: num(e.x), y: num(e.y), width: num(e.width), height: num(e.height) };
    if (num(Number(e.angle) * 1000) !== 0) s.angle = Math.round(Number(e.angle) * 1000) / 1000;
    if (e.type === "text") s.text = String(e.text ?? "");
    const label = labels.get(s.id);
    if (label !== undefined) s.label = label;
    for (const k of ["strokeColor", "backgroundColor", "fillStyle"] as const) if (e[k] !== undefined && e[k] !== DEFAULTS[k]) s[k] = String(e[k]);
    if (e.strokeWidth !== undefined && e.strokeWidth !== DEFAULTS.strokeWidth) s.strokeWidth = Number(e.strokeWidth);
    const sb = e.startBinding as Raw | null | undefined;
    const eb = e.endBinding as Raw | null | undefined;
    if (sb?.elementId) s.start = String(sb.elementId);
    if (eb?.elementId) s.end = String(eb.elementId);
    if (Array.isArray(e.groupIds) && e.groupIds.length) s.groupIds = e.groupIds as string[];
    if (typeof e.frameId === "string") s.frameId = e.frameId;
    return s;
  });
  return { count: shown.length, truncated: shown.length > limit, elements: out };
}
