import { describe, it, expect } from "vitest";
import { grantPath, assertGranted } from "../../src/main/services/grants";

describe("path grants", () => {
  it("only allows paths that were granted", () => {
    grantPath("/a/b.excalidraw");
    expect(assertGranted("/a/./b.excalidraw")).toBe("/a/b.excalidraw");
    expect(() => assertGranted("/etc/passwd")).toThrow("Path not permitted");
  });
});
