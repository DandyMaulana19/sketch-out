import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { registerTools, type AiRouter, type AiOp } from "../../src/main/mcp/tools";
import { grantFolder } from "../../src/main/services/grants";
import { listNotes, createNote } from "../../src/main/services/folders";

const folder = join(mkdtempSync(join(tmpdir(), "so-tools-")), "Catatan");
const note = join(folder, "alur.excalidraw");
const calls: { path: string; op: AiOp; args: unknown }[] = [];
const router: AiRouter = {
  isOpen: (p) => p === note,
  async request<T>(path: string, op: AiOp, args?: unknown): Promise<T> {
    calls.push({ path, op, args });
    if (op === "view") return { png: "iVBORw0KGgo=" } as T;
    if (op === "read") return { count: 0, truncated: false, elements: [] } as T;
    return { ids: ["n1"] } as T;
  },
};

async function client() {
  const server = new McpServer({ name: "sketch-out", version: "0" });
  registerTools(server, {
    router,
    workspace: () => ({ windows: [{ kind: "folder", folder, active: note }], recentFolders: [folder] }),
    listNotes,
    createNote: (dir, name) => createNote(dir, name, "{}"),
    openNote: async () => {},
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const c = new Client({ name: "t", version: "0" });
  await c.connect(a);
  return c;
}
const text = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content)[0].text;

beforeAll(() => {
  mkdirSync(folder, { recursive: true });
  writeFileSync(note, readFileSync("tests/fixtures/one-diamond.excalidraw"));
  writeFileSync(join(folder, "rapat.excalidraw"), readFileSync("tests/fixtures/two-shapes.excalidraw"));
  grantFolder(folder);
});

describe("MCP tools", () => {
  it("lists the nine tools", async () => {
    const c = await client();
    expect((await c.listTools()).tools.map((t) => t.name).sort()).toEqual(
      ["add_elements", "add_mermaid", "create_note", "delete_elements", "get_workspace", "list_notes", "read_note", "update_elements", "view_note"],
    );
  });

  it("refuses paths outside opened folders without touching the canvas", async () => {
    const c = await client();
    calls.length = 0;
    const r = await c.callTool({ name: "read_note", arguments: { path: "/etc/hosts.excalidraw" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Path not permitted");
    expect(calls).toHaveLength(0);
  });

  it("reads closed notes from disk and open notes from the canvas", async () => {
    const c = await client();
    calls.length = 0;
    const closed = JSON.parse(text(await c.callTool({ name: "read_note", arguments: { path: join(folder, "rapat.excalidraw") } })));
    expect(closed.elements.map((e: { type: string }) => e.type)).toEqual(["rectangle", "ellipse"]);
    expect(calls).toHaveLength(0);
    await c.callTool({ name: "read_note", arguments: { path: note } });
    expect(calls[0]).toMatchObject({ path: note, op: "read" });
  });

  it("validates element batches and forwards valid ones to the canvas", async () => {
    const c = await client();
    const many = Array.from({ length: 501 }, () => ({ type: "rectangle" }));
    expect((await c.callTool({ name: "add_elements", arguments: { path: note, elements: many } })).isError).toBe(true);
    calls.length = 0;
    const els = [{ type: "rectangle", id: "k1", label: { text: "Login" } }, { type: "arrow", start: { id: "k1" }, end: { type: "ellipse" } }];
    const r = await c.callTool({ name: "add_elements", arguments: { path: note, elements: els } });
    expect(r.isError).toBeFalsy();
    expect(calls[0]).toMatchObject({ path: note, op: "add", args: { elements: els } });
    expect(JSON.parse(text(r))).toEqual({ ids: ["n1"] });
  });

  it("returns the canvas image as PNG content", async () => {
    const c = await client();
    const r = await c.callTool({ name: "view_note", arguments: { path: note } });
    expect(r.content).toEqual([{ type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" }]);
  });

  it("lists notes and creates new ones inside the folder only", async () => {
    const c = await client();
    const list = JSON.parse(text(await c.callTool({ name: "list_notes", arguments: { folder } })));
    expect(list.map((n: { rel: string }) => n.rel)).toEqual(["alur.excalidraw", "rapat.excalidraw"]);
    const made = JSON.parse(text(await c.callTool({ name: "create_note", arguments: { dir: folder, name: "Ide" } })));
    expect(made.path).toBe(join(folder, "Ide.excalidraw"));
    expect((await c.callTool({ name: "create_note", arguments: { dir: tmpdir(), name: "x" } })).isError).toBe(true);
  });
});
