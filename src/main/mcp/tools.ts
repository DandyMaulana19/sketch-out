import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { NoteInfo } from "@shared/types";
import { summarize } from "@shared/scene-summary";
import { assertGranted, assertGrantedDir } from "../services/grants";
import { readLocalFile } from "../services/localFiles";

export type AiOp = "read" | "view" | "add" | "update" | "delete" | "mermaid";

/** Runs canvas operations in the window that shows a note (opening it first when needed). */
export interface AiRouter {
  isOpen(path: string): boolean;
  request<T = unknown>(path: string, op: AiOp, args?: unknown): Promise<T>;
}

export interface Workspace {
  windows: ({ kind: "folder"; folder: string; active: string | null } | { kind: "file"; path: string | null })[];
  recentFolders: string[];
}

export interface ToolDeps {
  router: AiRouter;
  workspace(): Workspace;
  listNotes(dir: string): Promise<NoteInfo[]>;
  createNote(dir: string, name: string): Promise<string>;
  openNote(path: string): Promise<void>;
}

const MAX_BATCH = 500;
const path = z.string().min(1).max(4096).describe("Absolute path of a note, from get_workspace or list_notes");
const color = z.string().max(64);
const ref = z.object({ id: z.string().max(200).optional(), type: z.string().max(32).optional() }).passthrough();
const skeleton = z
  .object({
    type: z.enum(["rectangle", "ellipse", "diamond", "text", "arrow", "line", "frame"]),
    id: z.string().max(200).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    text: z.string().max(20_000).optional(),
    label: z.object({ text: z.string().max(20_000) }).passthrough().optional(),
    strokeColor: color.optional(),
    backgroundColor: color.optional(),
    fillStyle: z.enum(["hachure", "cross-hatch", "solid", "zigzag"]).optional(),
    strokeWidth: z.number().optional(),
    strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    roughness: z.number().min(0).max(2).optional(),
    opacity: z.number().min(0).max(100).optional(),
    fontSize: z.number().optional(),
    start: ref.optional(),
    end: ref.optional(),
    points: z.array(z.tuple([z.number(), z.number()])).max(1000).optional(),
    name: z.string().max(200).optional(),
    children: z.array(z.string().max(200)).max(MAX_BATCH).optional(),
  })
  .passthrough();
const update = z
  .object({
    id: z.string().max(200),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    angle: z.number().optional(),
    text: z.string().max(20_000).optional(),
    strokeColor: color.optional(),
    backgroundColor: color.optional(),
    fillStyle: z.enum(["hachure", "cross-hatch", "solid", "zigzag"]).optional(),
    strokeWidth: z.number().optional(),
    strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    roughness: z.number().min(0).max(2).optional(),
    opacity: z.number().min(0).max(100).optional(),
    fontSize: z.number().optional(),
  })
  .strict();

const ok = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
const fail = (e: unknown): CallToolResult => ({ isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }] });
const wrap =
  <A>(fn: (a: A) => Promise<CallToolResult>) =>
  async (a: A): Promise<CallToolResult> => {
    try {
      return await fn(a);
    } catch (e) {
      return fail(e);
    }
  };

export function registerTools(server: McpServer, d: ToolDeps): void {
  server.registerTool(
    "get_workspace",
    { description: "Folders and files open in Sketch Out, the note each window shows, and recently opened folders. Start here.", inputSchema: {} },
    wrap(async () => ok(d.workspace())),
  );

  server.registerTool(
    "list_notes",
    { description: "All notes (.excalidraw) in an opened folder, including subfolders.", inputSchema: { folder: path.describe("Absolute folder path") } },
    wrap(async ({ folder }) => ok(await d.listNotes(assertGrantedDir(folder)))),
  );

  server.registerTool(
    "read_note",
    {
      description: "Elements of a note as compact JSON (id, type, position, size, text/label, colors, arrow start/end ids). Default styles are omitted.",
      inputSchema: { path },
    },
    wrap(async ({ path: p }) => {
      const abs = assertGranted(p);
      if (d.router.isOpen(abs)) return ok(await d.router.request(abs, "read"));
      const { json } = await readLocalFile(abs);
      return ok(summarize(JSON.parse(json).elements ?? []));
    }),
  );

  server.registerTool(
    "view_note",
    {
      description: "PNG image of a note's canvas, to check how a drawing looks. Opens the note in Sketch Out if needed.",
      inputSchema: { path, maxSize: z.number().int().min(200).max(1600).optional().describe("Longest side in pixels (default 1200)") },
    },
    wrap(async ({ path: p, maxSize }) => {
      const r = await d.router.request<{ png: string }>(assertGranted(p), "view", { maxSize: maxSize ?? 1200 });
      return { content: [{ type: "image", data: r.png, mimeType: "image/png" }] };
    }),
  );

  server.registerTool(
    "add_elements",
    {
      description:
        "Add Excalidraw elements to a note (shown live, one undo step). Use element skeletons: " +
        '{type:"rectangle"|"ellipse"|"diamond"|"text"|"arrow"|"line"|"frame", x, y, width, height, id?, label:{text}, text (for type text), ' +
        "strokeColor, backgroundColor, fillStyle, start/end:{id} to bind an arrow to an element given in the same call}. " +
        "Elements without x/y are placed below the existing content. Returns the new element ids.",
      inputSchema: { path, elements: z.array(skeleton).min(1).max(MAX_BATCH) },
    },
    wrap(async ({ path: p, elements }) => ok(await d.router.request(assertGranted(p), "add", { elements }))),
  );

  server.registerTool(
    "update_elements",
    {
      description: "Change elements by id: position, size, angle, text (also a shape's label), colors, fill and stroke. One undo step.",
      inputSchema: { path, updates: z.array(update).min(1).max(MAX_BATCH) },
    },
    wrap(async ({ path: p, updates }) => ok(await d.router.request(assertGranted(p), "update", { updates }))),
  );

  server.registerTool(
    "delete_elements",
    { description: "Delete elements by id (their labels go too). One undo step.", inputSchema: { path, ids: z.array(z.string().max(200)).min(1).max(MAX_BATCH) } },
    wrap(async ({ path: p, ids }) => ok(await d.router.request(assertGranted(p), "delete", { ids }))),
  );

  server.registerTool(
    "create_note",
    {
      description: "Create a new empty note in an opened folder (or one of its subfolders) and open it. Returns its path.",
      inputSchema: { dir: path.describe("Absolute folder path"), name: z.string().min(1).max(200).describe("Note name without extension") },
    },
    wrap(async ({ dir, name }) => {
      const created = await d.createNote(assertGrantedDir(dir), name);
      await d.openNote(created);
      return ok({ path: created });
    }),
  );

  server.registerTool(
    "add_mermaid",
    {
      description: "Draw a Mermaid diagram (flowchart, sequence, class…) into a note as editable Excalidraw elements. One undo step.",
      inputSchema: { path, mermaid: z.string().min(1).max(20_000) },
    },
    wrap(async ({ path: p, mermaid }) => ok(await d.router.request(assertGranted(p), "mermaid", { mermaid }))),
  );
}
