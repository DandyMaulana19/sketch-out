import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const newUserData = () => mkdtempSync(join(tmpdir(), "so-e2e-ud-"));

export async function launch(userData: string, args: string[] = []): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({ args: [".", ...args], env: { ...process.env, E2E: "1", SKETCHOUT_USER_DATA: userData } });
  const page = await app.firstWindow();
  await page.locator(".excalidraw-container").waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => !!(window as any).__so);
  return { app, page };
}

export const sendCommand = (app: ElectronApplication, cmd: string) =>
  app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send("menu:command", c), cmd);

export const stubSaveDialog = (app: ElectronApplication, filePath: string) =>
  app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as any;
  }, filePath);

export const stubOpenDialog = (app: ElectronApplication, filePath: string) =>
  app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as any;
  }, filePath);

export async function drawRectangle(page: Page) {
  const box = (await page.locator("canvas.excalidraw__canvas.interactive").boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + box.height - 60); // focus the editor
  await page.keyboard.press("r");
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 450, box.y + 400, { steps: 5 });
  await page.mouse.up();
}

export const sceneTypes = (page: Page) =>
  page.evaluate(() => (window as any).__so.getSceneElements().map((e: any) => e.type) as string[]);

export const windowTitle = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle());

/** Close the app, answering "Jangan simpan" to any unsaved-document prompt. */
export async function closeDiscarding(app: ElectronApplication) {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as any;
  });
  await app.close();
}
