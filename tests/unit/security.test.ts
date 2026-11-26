import { describe, it, expect, vi } from "vitest";
vi.mock("electron", () => ({ shell: { openExternal: vi.fn() } }));
import { secureWebPreferences, CSP } from "../../src/main/security";

describe("secureWebPreferences", () => {
  it("locks the renderer down", () => {
    expect(secureWebPreferences("/p")).toMatchObject({
      preload: "/p",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  });
});

describe("CSP", () => {
  it("contains the required directives", () => {
    for (const d of [
      "default-src 'self'",
      "script-src 'self'",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https:",
      "worker-src 'self' blob:",
      "frame-src https:",
    ]) expect(CSP).toContain(d);
  });
  it("never allows eval", () => {
    expect(CSP).not.toContain("unsafe-eval");
  });
});
