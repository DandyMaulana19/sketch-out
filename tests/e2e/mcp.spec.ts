import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { launch, newUserData, sceneTypes } from "./helpers";

const electronPath = createRequire(import.meta.url)("electron") as string;
const copyFolder = () => {
  const dir = join(mkdtempSync(join(tmpdir(), "so-e2e-mcp-")), "Catatan");
  cpSync(resolve("tests/fixtures/folder"), dir, { recursive: true });
  return dir;
};
const fileTypes = (f: string) => (JSON.parse(readFileSync(f, "utf8")).elements as { type: string; isDeleted?: boolean }[]).filter((e) => !e.isDeleted).map((e) => e.type);
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

async function mcpClient(userData: string, extraArgs: string[] = []) {
  const transport = new StdioClientTransport({
    command: electronPath,
    args: [".", ...extraArgs, "--mcp"],
    env: { ...process.env, E2E: "1", SKETCHOUT_USER_DATA: userData } as Record<string, string>,
  });
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(transport);
  return client;
}

test("an AI client draws in the open note through `--mcp`, as one undo step", async () => {
  const dir = copyFolder();
  const userData = newUserData();
  const { app, page } = await launch(userData, [dir]);
  await expect.poll(() => sceneTypes(page)).toEqual(["diamond"]);
  const ai = await mcpClient(userData);
  try {
    expect((await ai.listTools()).tools).toHaveLength(9);
    const ws = JSON.parse(text(await ai.callTool({ name: "get_workspace", arguments: {} })));
    expect(ws.windows[0]).toMatchObject({ kind: "folder", folder: dir, active: join(dir, "alur.excalidraw") });

    const alur = join(dir, "alur.excalidraw");
    const added = await ai.callTool({
      name: "add_elements",
      arguments: { path: alur, elements: [{ type: "rectangle", id: "k1", label: { text: "Login" } }, { type: "rectangle", id: "k2", label: { text: "Dashboard" } }, { type: "arrow", start: { id: "k1" }, end: { id: "k2" } }] },
    });
    expect(added.isError).toBeFalsy();
    await expect.poll(async () => (await sceneTypes(page)).sort()).toEqual(["arrow", "diamond", "rectangle", "rectangle", "text", "text"]);
    await expect.poll(() => fileTypes(alur), { timeout: 5000 }).toContain("arrow");

    await page.locator("canvas.excalidraw__canvas.interactive").click({ position: { x: 20, y: 400 } });
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(() => sceneTypes(page)).toEqual(["diamond"]);

    const outside = await ai.callTool({ name: "read_note", arguments: { path: "/etc/hosts.excalidraw" } });
    expect(outside.isError).toBe(true);

    const view = await ai.callTool({ name: "view_note", arguments: { path: alur } });
    expect((view.content as { type: string; data: string }[])[0]).toMatchObject({ type: "image" });
    expect((view.content as { data: string }[])[0].data.startsWith("iVBOR")).toBe(true);

    // A note that is not on screen is brought up as the active tab before the AI edits it.
    const rapat = join(dir, "rapat.excalidraw");
    await ai.callTool({ name: "add_elements", arguments: { path: rapat, elements: [{ type: "diamond", x: 600, y: 100, width: 80, height: 80 }] } });
    await expect(page.locator(".so-tab.is-active .so-tab__label")).toHaveText("rapat");
    await expect.poll(() => sceneTypes(page)).toEqual(["rectangle", "ellipse", "diamond"]);
  } finally {
    await ai.close();
    await app.close();
  }
});

test("a note changed on disk with no local edits reloads by itself", async () => {
  const dir = copyFolder();
  const { app, page } = await launch(newUserData(), [dir]);
  await expect.poll(() => sceneTypes(page)).toEqual(["diamond"]);
  writeFileSync(join(dir, "alur.excalidraw"), readFileSync(resolve("tests/fixtures/two-shapes.excalidraw")));
  await expect.poll(() => sceneTypes(page), { timeout: 8000 }).toEqual(["rectangle", "ellipse"]);
  await app.close();
});

const appPids = () =>
  new Set(
    execSync(`pgrep -f "${electronPath.replace(/"/g, '\\"')} \\.$" || true`)
      .toString()
      .split("\n")
      .filter(Boolean),
  );

test("the bridge starts Sketch Out when it is not running", async () => {
  const before = appPids();
  const ai = await mcpClient(newUserData());
  try {
    expect(ai.getServerVersion()?.name).toBe("sketch-out");
    const ws = JSON.parse(text(await ai.callTool({ name: "get_workspace", arguments: {} })));
    expect(Array.isArray(ws.windows)).toBe(true);
  } finally {
    await ai.close();
    // Quit the app instance the bridge launched for this test.
    for (const pid of appPids()) if (!before.has(pid)) process.kill(Number(pid));
  }
});
