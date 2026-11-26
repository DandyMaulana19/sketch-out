import { CaptureUpdateAction, convertToExcalidrawElements, exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { summarize } from "../../shared/scene-summary";
import type { AiOp } from "../../preload/api";
import { applyUpdates, markDeleted, placeBelow, routeArrow, sizeForLabel, type El, type Update } from "./ops";

type Skeleton = Record<string, unknown> & { type: string; id?: string; x?: number; y?: number };
const GRID = 220;

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Insert converted elements as one undo step; batches without positions go below the existing content. */
function insert(api: ExcalidrawImperativeAPI, skeletons: Skeleton[], forcePlace: boolean): { ids: string[] } {
  const current = api.getSceneElementsIncludingDeleted() as unknown as El[];
  const taken = new Set(current.map((e) => e.id));
  const dup = skeletons.find((s) => s.id && taken.has(s.id));
  if (dup) throw new Error(`id "${dup.id}" sudah dipakai di catatan ini`);
  const unplaced = forcePlace || skeletons.some((s) => s.x === undefined || s.y === undefined);
  // Shapes without coordinates are laid out in a row; the whole batch is then moved below the content.
  // Arrows without coordinates are routed between the shapes they connect once those exist.
  let col = 0;
  const routed = new Set<string>();
  const prepared = skeletons.map((raw) => {
    const s = sizeForLabel(raw);
    const linear = s.type === "arrow" || s.type === "line";
    if (linear && (s.x === undefined || s.y === undefined) && !s.points) {
      const id = s.id ?? `ai-${Math.random().toString(36).slice(2, 10)}`;
      routed.add(id);
      return { ...s, id, x: 0, y: 0 };
    }
    return s.x === undefined || s.y === undefined ? { ...s, x: s.x ?? col++ * GRID, y: s.y ?? 0 } : s;
  });
  const converted = convertToExcalidrawElements(prepared as never, { regenerateIds: false }) as unknown as El[];
  const byId = new Map(converted.map((e) => [e.id, e]));
  const created = converted.map((e) => {
    if (!routed.has(e.id)) return e;
    const a = e.startBinding && byId.get(e.startBinding.elementId);
    const b = e.endBinding && byId.get(e.endBinding.elementId);
    return a && b ? { ...e, ...routeArrow(a, b) } : e;
  });
  const live = current.filter((e) => !e.isDeleted);
  const { dx, dy } = unplaced ? placeBelow(live, created) : { dx: 0, dy: 0 };
  const moved = created.map((e) => (dx || dy ? { ...e, x: e.x + dx, y: e.y + dy } : e));
  api.updateScene({ elements: [...current, ...moved] as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  api.scrollToContent(moved as never, { fitToViewport: true, viewportZoomFactor: 0.8, animate: true });
  return { ids: moved.filter((e) => !e.containerId).map((e) => e.id) };
}

/** The canvas side of each MCP tool (see src/main/mcp/tools.ts). */
export async function runCanvasOp(api: ExcalidrawImperativeAPI, op: AiOp, args: Record<string, unknown>): Promise<unknown> {
  switch (op) {
    case "read":
      return summarize(api.getSceneElementsIncludingDeleted() as unknown as unknown[]);
    case "view": {
      const elements = api.getSceneElements();
      if (!elements.length) throw new Error("Catatan ini masih kosong");
      const blob = await exportToBlob({
        elements,
        appState: { ...api.getAppState(), exportBackground: true },
        files: api.getFiles(),
        maxWidthOrHeight: Number(args.maxSize) || 1200,
        mimeType: "image/png",
      });
      return { png: await toBase64(blob) };
    }
    case "add":
      return insert(api, args.elements as Skeleton[], false);
    case "update": {
      const r = applyUpdates(api.getSceneElementsIncludingDeleted() as unknown as El[], args.updates as Update[]);
      api.updateScene({ elements: r.elements as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      return { updated: (args.updates as Update[]).length - r.missing.length, missing: r.missing };
    }
    case "delete": {
      const r = markDeleted(api.getSceneElementsIncludingDeleted() as unknown as El[], args.ids as string[]);
      api.updateScene({ elements: r.elements as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      return { deleted: (args.ids as string[]).length - r.missing.length, missing: r.missing };
    }
    case "mermaid": {
      const { parseMermaidToExcalidraw } = await import("@excalidraw/mermaid-to-excalidraw");
      const parsed = await parseMermaidToExcalidraw(String(args.mermaid)).catch((e: Error) => {
        throw new Error(`Mermaid tidak valid: ${e.message}`);
      });
      if (parsed.files) api.addFiles(Object.values(parsed.files) as never);
      return insert(api, parsed.elements as unknown as Skeleton[], true);
    }
  }
}
