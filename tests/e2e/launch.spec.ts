import { test, expect, _electron as electron } from "@playwright/test";
import { newUserData } from "./helpers";

test("app launches the Excalidraw editor in a locked-down renderer, fonts available offline", async () => {
  const app = await electron.launch({ args: ["."], env: { ...process.env, E2E: "1", SKETCHOUT_USER_DATA: newUserData() } }); // own userData: an installed Sketch Out would otherwise take the single-instance lock
  try {
    const page = await app.firstWindow();
    await page.route("**/*", (r) =>
      new URL(r.request().url()).protocol.startsWith("http") ? r.abort() : r.continue(),
    );
    await expect(page.locator(".excalidraw-container")).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => typeof (window as any).require)).toBe("undefined");
    expect(await page.evaluate(() => typeof (window as any).process)).toBe("undefined");
    const loaded = await page.evaluate(async () => {
      const faces = await document.fonts.load("16px Excalifont");
      return faces.filter((f) => f.status === "loaded").length;
    });
    expect(loaded).toBeGreaterThan(0);
  } finally {
    await app.close();
  }
});
