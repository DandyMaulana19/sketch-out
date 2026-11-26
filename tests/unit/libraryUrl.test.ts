import { describe, it, expect } from "vitest";
import { parseAddLibraryUrl } from "../../src/main/services/libraryUrl";

const lib = "https://libraries.excalidraw.com/libraries/someone/arrows.excalidrawlib";

describe("parseAddLibraryUrl", () => {
  it("extracts the library URL from the protocol callback", () => {
    expect(parseAddLibraryUrl(`sketchout://addLibrary#addLibrary=${encodeURIComponent(lib)}&token=abc`)).toBe(lib);
  });
  it("rejects libraries hosted elsewhere", () => {
    expect(parseAddLibraryUrl(`sketchout://addLibrary#addLibrary=${encodeURIComponent("https://evil.com/x.excalidrawlib")}`)).toBeNull();
  });
  it("rejects plain http", () => {
    expect(parseAddLibraryUrl(`sketchout://addLibrary#addLibrary=${encodeURIComponent(lib.replace("https", "http"))}`)).toBeNull();
  });
  it("rejects callbacks without addLibrary or with another scheme", () => {
    expect(parseAddLibraryUrl("sketchout://addLibrary#token=abc")).toBeNull();
    expect(parseAddLibraryUrl(`https://x#addLibrary=${encodeURIComponent(lib)}`)).toBeNull();
    expect(parseAddLibraryUrl("not a url")).toBeNull();
  });
});
