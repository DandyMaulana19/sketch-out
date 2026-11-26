import { test, expect, type Page } from "@playwright/test";
import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drawRectangle, launch, newUserData, sceneTypes, windowTitle } from "./helpers";

const copyFolder = () => {
  const dir = join(mkdtempSync(join(tmpdir(), "so-e2e-folder-")), "Catatan");
  cpSync(resolve("tests/fixtures/folder"), dir, { recursive: true });
  return dir;
};
const types = (file: string) => (JSON.parse(readFileSync(file, "utf8")).elements as { type: string; isDeleted?: boolean }[]).filter((e) => !e.isDeleted).map((e) => e.type);
const row = (page: Page, rel: string) => page.locator(`[data-rel="${rel}"]`);
const activeTab = (page: Page) => page.locator(".so-tab.is-active .so-tab__label");

test("a folder opens with a tree of its notes; empty subfolders are hidden", async () => {
  const dir = copyFolder();
  const { app, page } = await launch(newUserData(), [dir]);
  await expect(page.locator(".so-side__title")).toHaveText("Catatan");
  await expect(row(page, "alur.excalidraw")).toBeVisible();
  await expect(row(page, "rapat.excalidraw")).toBeVisible();
  await expect(page.locator(".so-tree__dir .so-tree__name")).toHaveText(["riset"]);
  await expect(row(page, "riset/ide.excalidraw")).toBeVisible();
  await expect(activeTab(page)).toHaveText("alur");
  await expect.poll(() => sceneTypes(page)).toEqual(["diamond"]);
  await expect.poll(() => windowTitle(app)).toBe("alur — Catatan");
  await app.close();
});

test("edits are saved to their own file when switching tabs, and tabs come back after restart", async () => {
  const dir = copyFolder();
  const userData = newUserData();
  const rapatBefore = readFileSync(join(dir, "rapat.excalidraw"), "utf8");
  let { app, page } = await launch(userData, [dir]);
  await expect.poll(() => sceneTypes(page)).toEqual(["diamond"]);

  await drawRectangle(page);
  await row(page, "rapat.excalidraw").click(); // switching flushes immediately, no autosave wait
  await expect(activeTab(page)).toHaveText("rapat");
  expect(types(join(dir, "alur.excalidraw"))).toEqual(["diamond", "rectangle"]);
  await expect.poll(() => sceneTypes(page)).toEqual(["rectangle", "ellipse"]);
  expect(readFileSync(join(dir, "rapat.excalidraw"), "utf8")).toBe(rapatBefore);

  await page.locator(".so-tab", { hasText: "alur" }).locator(".so-tab__label").click();
  await expect.poll(() => sceneTypes(page)).toEqual(["diamond", "rectangle"]);
  await row(page, "riset/ide.excalidraw").click();
  await expect(activeTab(page)).toHaveText("ide");
  await page.waitForTimeout(300);
  await app.close();

  ({ app, page } = await launch(userData, [dir]));
  await expect(page.locator(".so-tab .so-tab__label")).toHaveText(["alur", "rapat", "ide"]);
  await expect(activeTab(page)).toHaveText("ide");
  await app.close();
});

test("a new note is created in the folder and opened as the active tab", async () => {
  const dir = copyFolder();
  const { app, page } = await launch(newUserData(), [dir]);
  await expect.poll(() => sceneTypes(page)).toEqual(["diamond"]);
  await page.getByRole("button", { name: "Catatan baru" }).first().click();
  const input = page.getByLabel("Nama");
  await input.fill("Ide");
  await input.press("Enter");
  await expect(activeTab(page)).toHaveText("Ide");
  expect(existsSync(join(dir, "Ide.excalidraw"))).toBe(true);
  await expect(row(page, "Ide.excalidraw")).toBeVisible();
  await expect.poll(() => sceneTypes(page)).toEqual([]);
  await app.close();
});

test("closing the last tab leaves an empty state and the window closes without prompting", async () => {
  const dir = copyFolder();
  const { app, page } = await launch(newUserData(), [dir]);
  await expect(activeTab(page)).toHaveText("alur");
  await page.locator(".so-tab__close").click();
  await expect(page.locator(".so-empty")).toHaveText("Pilih catatan di sidebar");
  await expect.poll(() => windowTitle(app)).toBe("Catatan — Sketch Out");
  const closed = app.evaluate(({ BrowserWindow }) => new Promise<boolean>((r) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.once("closed", () => r(true));
    w.close();
  }));
  expect(await closed).toBe(true);
  await app.close();
});
