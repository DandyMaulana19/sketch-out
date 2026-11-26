import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { launch, newUserData, sceneTypes } from "./helpers";

const electronPath = createRequire(import.meta.url)("electron") as string;

const fixture = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), "so-e2e-open-"));
  const p = join(dir, name);
  copyFileSync(resolve("tests/fixtures", name), p);
  return p;
};

test("a file passed on the command line opens in the first window", async () => {
  const { app, page } = await launch(newUserData(), [fixture("one-diamond.excalidraw")]);
  await expect.poll(() => sceneTypes(page)).toEqual(["diamond"]);
  await app.close();
});

test("a second launch hands its file to the running instance and opens a new window", async () => {
  const userData = newUserData();
  const { app } = await launch(userData);
  const second = fixture("two-shapes.excalidraw");
  const child = spawn(electronPath, [".", second], { env: { ...process.env, E2E: "1", SKETCHOUT_USER_DATA: userData }, stdio: "ignore" });
  const exitCode = await new Promise<number | null>((r) => child.on("exit", r));
  expect(exitCode).toBe(0);
  await expect.poll(() => app.windows().length, { timeout: 10_000 }).toBe(2);
  const win = app.windows()[1];
  await win.waitForFunction(() => !!(window as any).__so);
  await expect.poll(() => sceneTypes(win)).toEqual(["rectangle", "ellipse"]);
  await app.close();
});
