import { test, expect } from "@playwright/test";
import { launch, newUserData } from "./helpers";

test("theme and library persist across restarts", async () => {
  const userData = newUserData();
  let { app, page } = await launch(userData);
  await page.evaluate(() => {
    const api = (window as any).__so;
    api.updateScene({ appState: { theme: "dark" } });
    return api.updateLibrary({
      libraryItems: [{ id: "lib1", status: "unpublished", created: 1, elements: [{ id: "x1", type: "rectangle", x: 0, y: 0, width: 10, height: 10, version: 1, versionNonce: 1, isDeleted: false, angle: 0, strokeColor: "#000", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 1, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [], frameId: null, roundness: null, seed: 1, boundElements: null, updated: 1, link: null, locked: false }] }],
    });
  });
  await page.waitForTimeout(1200);
  await app.close();

  ({ app, page } = await launch(userData));
  await expect(page.locator(".excalidraw.theme--dark")).toBeVisible();
  const ids = await page.evaluate(async () => {
    const items = await (window as any).__so.updateLibrary({ libraryItems: [], merge: true });
    return items.map((i: any) => i.id);
  });
  expect(ids).toContain("lib1");
  await app.close();
});
