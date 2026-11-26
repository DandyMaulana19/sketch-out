import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, newUserData, sendCommand, stubSaveDialog, stubOpenDialog, drawRectangle, sceneTypes, windowTitle, closeDiscarding } from "./helpers";

test("save a drawing to disk, autosave further edits, reopen it after restart", async () => {
  const userData = newUserData();
  const file = join(mkdtempSync(join(tmpdir(), "so-e2e-files-")), "diagram.excalidraw");

  let { app, page } = await launch(userData);
  await drawRectangle(page);
  await stubSaveDialog(app, file);
  await sendCommand(app, "saveAs");
  await expect.poll(() => { try { return JSON.parse(readFileSync(file, "utf8")).elements.length; } catch { return 0; } }).toBe(1);
  expect(JSON.parse(readFileSync(file, "utf8")).elements[0].type).toBe("rectangle");
  await expect.poll(() => windowTitle(app)).toContain("diagram");

  // Autosave: a second shape lands on disk without an explicit save.
  await page.keyboard.press("Escape");
  const box = (await page.locator("canvas.excalidraw__canvas.interactive").boundingBox())!;
  await page.keyboard.press("o");
  await page.mouse.move(box.x + 600, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 700, box.y + 380, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => JSON.parse(readFileSync(file, "utf8")).elements.length, { timeout: 5000 }).toBe(2);
  await app.close();

  ({ app, page } = await launch(userData));
  await stubOpenDialog(app, file);
  await sendCommand(app, "open");
  await expect.poll(() => sceneTypes(page)).toEqual(["rectangle", "ellipse"]);
  await app.close();
});

test("an untitled drawing survives a crash and is restored on next launch", async () => {
  const userData = newUserData();
  let { app, page } = await launch(userData);
  await drawRectangle(page);
  await page.waitForTimeout(1500); // autosave to recovery
  const pid = app.process().pid!;
  process.kill(pid, "SIGKILL");
  await new Promise((r) => setTimeout(r, 500));

  ({ app, page } = await launch(userData));
  await expect.poll(() => sceneTypes(page)).toEqual(["rectangle"]);
  await closeDiscarding(app);
});

test("choosing 'Jangan simpan' on close discards the untitled drawing", async () => {
  const userData = newUserData();
  let { app, page } = await launch(userData);
  await drawRectangle(page);
  await page.waitForTimeout(1500);
  await closeDiscarding(app);
  ({ app, page } = await launch(userData));
  expect(await sceneTypes(page)).toEqual([]);
  await app.close();
});

test("an empty canvas leaves nothing to restore and shows no pending save", async () => {
  const userData = newUserData();
  let { app, page } = await launch(userData);
  await page.waitForTimeout(1500);
  await expect(page.locator(".so-badge")).toContainText("Belum disimpan ke file");
  await app.close();
  ({ app, page } = await launch(userData));
  expect(app.windows()).toHaveLength(1);
  await app.close();
});
