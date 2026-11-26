import { describe, it, expect } from "vitest";
import { shortcutLabel, isInside, isWindowsPath, joinRel, pathKey, relTo, sepOf } from "../../src/shared/paths";

describe("shared paths", () => {
  it("recognises Windows paths by shape", () => {
    expect(isWindowsPath("C:\\Users\\ana")).toBe(true);
    expect(isWindowsPath("d:/notes")).toBe(true);
    expect(isWindowsPath("\\\\server\\share")).toBe(true);
    expect(isWindowsPath("/Users/ana")).toBe(false);
    expect(sepOf("C:\\x")).toBe("\\");
    expect(sepOf("/x")).toBe("/");
  });

  it("joins a /-relative path with the folder's separator", () => {
    expect(joinRel("/Users/ana/notes", "sub/a.excalidraw")).toBe("/Users/ana/notes/sub/a.excalidraw");
    expect(joinRel("C:\\Notes", "sub/a.excalidraw")).toBe("C:\\Notes\\sub\\a.excalidraw");
    expect(joinRel("C:\\", "a.excalidraw")).toBe("C:\\a.excalidraw");
  });

  it("makes a /-relative path, or null outside the folder", () => {
    expect(relTo("/Users/ana/notes", "/Users/ana/notes/sub/a.excalidraw")).toBe("sub/a.excalidraw");
    expect(relTo("/Users/ana/notes", "/Users/ana/notes2/a.excalidraw")).toBeNull();
    expect(relTo("C:\\Notes", "c:\\notes\\Sub\\a.excalidraw")).toBe("Sub/a.excalidraw");
    expect(relTo("C:\\Notes", "C:\\Notes")).toBeNull();
  });

  it("checks containment: exact on POSIX, case- and separator-insensitive on Windows", () => {
    expect(isInside("/a/b/c", "/a/b")).toBe(true);
    expect(isInside("/a/b/c", "/a/b/")).toBe(true);
    expect(isInside("/a/bc", "/a/b")).toBe(false);
    expect(isInside("/A/b/c", "/a/b")).toBe(false);
    expect(isInside("/a/b", "/a/b")).toBe(false);
    expect(isInside("c:\\notes\\a.excalidraw", "C:\\Notes")).toBe(true);
    expect(isInside("C:/Notes/sub/a.excalidraw", "C:\\Notes\\")).toBe(true);
    expect(isInside("C:\\Notes2\\a.excalidraw", "C:\\Notes")).toBe(false);
    expect(isInside("D:\\Notes\\a.excalidraw", "C:\\Notes")).toBe(false);
  });

  it("folds case only for Windows keys", () => {
    expect(pathKey("C:/Notes/A.excalidraw")).toBe(pathKey("c:\\notes\\a.excalidraw"));
    expect(pathKey("/Users/A.excalidraw")).not.toBe(pathKey("/Users/a.excalidraw"));
  });

  it("labels shortcuts per platform", () => {
    expect(shortcutLabel("Mod+Shift+O", true)).toBe("⌘⇧O");
    expect(shortcutLabel("Mod+Shift+O", false)).toBe("Ctrl+Shift+O");
  });
});
