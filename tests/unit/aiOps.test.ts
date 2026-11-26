import { describe, it, expect } from "vitest";
import { applyUpdates, markDeleted, placeBelow, type El } from "../../src/renderer/ai/ops";

const el = (over: Partial<El> & { id: string }): El => ({
  type: "rectangle", x: 0, y: 0, width: 10, height: 10, version: 1, versionNonce: 1, isDeleted: false, ...over,
});

describe("placeBelow", () => {
  it("puts new content at the origin on an empty canvas", () => {
    expect(placeBelow([], [{ x: 5, y: 5, width: 10, height: 10 }])).toEqual({ dx: 0, dy: 0 });
  });
  it("moves new content below existing content, aligned to its left edge", () => {
    const existing = [{ x: 40, y: 0, width: 100, height: 100 }];
    const added = [{ x: 0, y: 10, width: 50, height: 20 }];
    expect(placeBelow(existing, added)).toEqual({ dx: 40, dy: 180 - 10 });
  });
});

describe("applyUpdates", () => {
  it("changes allowed props, bumps version, ignores type/id and reports unknown ids", () => {
    const els = [el({ id: "a" })];
    const r = applyUpdates(els, [{ id: "a", x: 50, strokeColor: "#e03131", type: "ellipse" } as never, { id: "zzz", x: 1 }]);
    expect(r.missing).toEqual(["zzz"]);
    expect(r.elements[0]).toMatchObject({ id: "a", type: "rectangle", x: 50, strokeColor: "#e03131", version: 2 });
    expect(r.elements[0].versionNonce).not.toBe(1);
    expect(els[0].x).toBe(0); // input untouched
  });
  it("text on a labelled shape edits its bound text", () => {
    const els = [el({ id: "box", boundElements: [{ id: "t", type: "text" }] }), el({ id: "t", type: "text", text: "old", originalText: "old", containerId: "box" })];
    const r = applyUpdates(els, [{ id: "box", text: "Login" }]);
    expect(r.elements.find((e) => e.id === "t")).toMatchObject({ text: "Login", originalText: "Login", version: 2 });
  });
});

describe("markDeleted", () => {
  it("deletes elements with their bound labels and unbinds arrows pointing at them", () => {
    const els = [
      el({ id: "box", boundElements: [{ id: "t", type: "text" }, { id: "arr", type: "arrow" }] }),
      el({ id: "t", type: "text", containerId: "box" }),
      el({ id: "arr", type: "arrow", startBinding: { elementId: "box", focus: 0, gap: 1 }, endBinding: { elementId: "other", focus: 0, gap: 1 } }),
      el({ id: "other" }),
    ];
    const r = markDeleted(els, ["box", "nope"]);
    expect(r.missing).toEqual(["nope"]);
    const by = Object.fromEntries(r.elements.map((e) => [e.id, e]));
    expect(by.box.isDeleted).toBe(true);
    expect(by.t.isDeleted).toBe(true);
    expect(by.arr.isDeleted).toBe(false);
    expect(by.arr.startBinding).toBeNull();
    expect(by.arr.endBinding).toMatchObject({ elementId: "other" });
  });
});

import { routeArrow, sizeForLabel } from "../../src/renderer/ai/ops";

describe("routeArrow", () => {
  it("runs from the edge of the start shape to the edge of the end shape", () => {
    const a = el({ id: "a", x: 0, y: 0, width: 100, height: 60 });
    const b = el({ id: "b", x: 300, y: 0, width: 100, height: 60 });
    const r = routeArrow(a, b, 8);
    expect(r.x).toBe(108);
    expect(r.y).toBe(30);
    expect(r.points).toEqual([[0, 0], [184, 0]]);
    expect(r.width).toBe(184);
    expect(r.height).toBe(0);
  });
  it("handles shapes stacked vertically", () => {
    const a = el({ id: "a", x: 0, y: 0, width: 100, height: 60 });
    const b = el({ id: "b", x: 0, y: 200, width: 100, height: 60 });
    const r = routeArrow(a, b, 8);
    expect([r.x, r.y]).toEqual([50, 68]);
    expect(r.points).toEqual([[0, 0], [0, 124]]);
  });
});

describe("sizeForLabel", () => {
  it("widens labelled shapes without an explicit width", () => {
    expect(sizeForLabel({ type: "rectangle", label: { text: "Dashboard" } })).toMatchObject({ width: 160, height: 70 });
    expect(sizeForLabel({ type: "rectangle", label: { text: "Proses pembayaran pelanggan" } }).width).toBeGreaterThan(300);
    expect(sizeForLabel({ type: "rectangle", width: 90, label: { text: "Dashboard" } })).toMatchObject({ width: 90 });
    expect(sizeForLabel({ type: "text", text: "hai" })).toEqual({ type: "text", text: "hai" });
  });
});
