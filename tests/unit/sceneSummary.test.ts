import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { summarize } from "../../src/shared/scene-summary";

const base = (over: Record<string, unknown>) => ({
  angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, groupIds: [], frameId: null, isDeleted: false, ...over,
});

describe("summarize", () => {
  it("drops deleted elements and defaults, rounds numbers, folds bound text into labels", () => {
    const fixture = JSON.parse(readFileSync("tests/fixtures/two-shapes.excalidraw", "utf8")).elements;
    const els = [
      ...fixture,
      base({ id: "gone", type: "rectangle", x: 0, y: 0, width: 1, height: 1, isDeleted: true }),
      base({ id: "box", type: "rectangle", x: 10.4, y: 20.6, width: 100, height: 50, backgroundColor: "#ffc9c9", boundElements: [{ id: "lbl", type: "text" }] }),
      base({ id: "lbl", type: "text", x: 20, y: 30, width: 40, height: 20, text: "Login", containerId: "box" }),
      base({ id: "arr", type: "arrow", x: 0, y: 0, width: 50, height: 0, startBinding: { elementId: "box" }, endBinding: null }),
    ];
    const s = summarize(els);
    expect(s.count).toBe(4); // 2 fixture shapes + box + arrow (the bound label is folded into the box)
    expect(s.truncated).toBe(false);
    expect(s.elements.map((e) => e.id)).toEqual(["0", "1", "box", "arr"].filter((id) => s.elements.some((e) => e.id === id)));
    const box = s.elements.find((e) => e.id === "box")!;
    expect(box).toEqual({ id: "box", type: "rectangle", x: 10, y: 21, width: 100, height: 50, backgroundColor: "#ffc9c9", label: "Login" });
    expect(s.elements.find((e) => e.id === "lbl")).toBeUndefined();
    expect(s.elements.find((e) => e.id === "arr")!.start).toBe("box");
    expect(summarize(els, 1)).toMatchObject({ truncated: true, count: 4 });
    expect(summarize(els, 1).elements).toHaveLength(1);
  });
});
