import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() }, shell: { openExternal: vi.fn() } }));
import { isTrustedSender, makeHandle } from "../../src/main/ipc/register";

const frame = (url: string) => ({ url }) as any;

describe("isTrustedSender", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  it("trusts the packaged renderer", () => {
    expect(isTrustedSender(frame("file:///Applications/Sketch%20Out.app/Contents/Resources/app.asar/out/renderer/index.html"))).toBe(true);
  });
  it("trusts the dev server", () => {
    vi.stubEnv("ELECTRON_RENDERER_URL", "http://localhost:5173");
    expect(isTrustedSender(frame("http://localhost:5173/"))).toBe(true);
  });
  it("rejects foreign origins and missing frames", () => {
    expect(isTrustedSender(frame("https://evil.com"))).toBe(false);
    expect(isTrustedSender(null)).toBe(false);
  });
});

describe("handle", () => {
  const setup = () => {
    const handlers = new Map<string, (e: any, input: unknown) => Promise<unknown>>();
    const handle = makeHandle({ handle: (ch: string, fn: any) => handlers.set(ch, fn) } as any);
    return { handlers, handle };
  };
  const trusted = { senderFrame: frame("file:///x/out/renderer/index.html") };

  it("rejects invalid input without calling fn", async () => {
    const { handlers, handle } = setup();
    const fn = vi.fn();
    handle("files:read", z.object({ path: z.string() }), fn);
    await expect(handlers.get("files:read")!(trusted, { path: 1 })).rejects.toThrow("Invalid input");
    expect(fn).not.toHaveBeenCalled();
  });
  it("rejects untrusted senders", async () => {
    const { handlers, handle } = setup();
    const fn = vi.fn();
    handle("files:read", z.object({ path: z.string() }), fn);
    await expect(handlers.get("files:read")!({ senderFrame: frame("https://evil.com") }, { path: "a" })).rejects.toThrow("Untrusted sender");
    expect(fn).not.toHaveBeenCalled();
  });
  it("passes parsed input through", async () => {
    const { handlers, handle } = setup();
    handle("files:read", z.object({ path: z.string() }), async (i) => i.path.toUpperCase());
    await expect(handlers.get("files:read")!(trusted, { path: "a" })).resolves.toBe("A");
  });
});
