import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { grantPath, assertGranted, grantFolder, assertGrantedDir } from "../../src/main/services/grants";

describe("path grants", () => {
  it("only allows paths that were granted", () => {
    grantPath("/a/b.excalidraw");
    expect(assertGranted("/a/./b.excalidraw")).toBe("/a/b.excalidraw");
    expect(() => assertGranted("/etc/passwd")).toThrow("Path not permitted");
  });
});

describe("folder grants", () => {
  it("allows .excalidraw files anywhere inside a granted folder and nothing else", async () => {
    const base = await mkdtemp(join(tmpdir(), "so-grant-"));
    const d = join(base, "d");
    await mkdir(join(d, "sub"), { recursive: true });
    await mkdir(join(base, "d-lain"));
    await writeFile(join(base, "outside.excalidraw"), "{}");
    await symlink(join(base, "outside.excalidraw"), join(d, "l.excalidraw"));
    grantFolder(d);

    expect(assertGranted(join(d, "x.excalidraw"))).toBe(join(d, "x.excalidraw"));
    expect(assertGranted(join(d, "sub", "x.excalidraw"))).toBe(join(d, "sub", "x.excalidraw"));
    expect(() => assertGranted(join(d, "x.txt"))).toThrow("Path not permitted");
    expect(() => assertGranted(join(d, "..", "x.excalidraw"))).toThrow("Path not permitted");
    expect(() => assertGranted(join(base, "d-lain", "x.excalidraw"))).toThrow("Path not permitted");
    expect(() => assertGranted(join(d, "l.excalidraw"))).toThrow("Path not permitted");
  });

  it("assertGrantedDir accepts the folder and its subfolders only", async () => {
    const base = await mkdtemp(join(tmpdir(), "so-grant-"));
    const d = join(base, "d");
    await mkdir(join(d, "sub"), { recursive: true });
    grantFolder(d);
    expect(assertGrantedDir(d)).toBe(d);
    expect(assertGrantedDir(join(d, "sub"))).toBe(join(d, "sub"));
    expect(() => assertGrantedDir(base)).toThrow("Path not permitted");
  });
});
