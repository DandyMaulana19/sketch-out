import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CLIENTS, copyText, type ClientEnv } from "../../src/main/ai/clients";

const cmd = { command: "/Applications/Sketch Out.app/Contents/MacOS/Sketch Out", args: ["--mcp"] };

function env(opts: { bins?: string[]; get?: (bin: string) => { code: number; stdout: string } } = {}) {
  const home = mkdtempSync(join(tmpdir(), "so-home-"));
  const calls: string[][] = [];
  const e: ClientEnv = {
    home,
    async exec(bin, args) {
      calls.push([bin, ...args]);
      if (args[1] === "get") return opts.get?.(bin) ?? { code: 1, stdout: "" };
      return { code: 0, stdout: "" };
    },
    which: async (bin) => (opts.bins ?? []).includes(bin),
    exists: async (p) => existsSync(p),
  };
  return { e, home, calls };
}
const write = (p: string, s: string) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, s);
};
const desktopFile = (home: string) => join(home, "Library/Application Support/Claude/claude_desktop_config.json");

describe("JSON-config clients", () => {
  it("Claude Desktop: adds only our entry, backs up once, is idempotent, reports status, and disconnects cleanly", async () => {
    const { e, home } = env();
    const f = desktopFile(home);
    const original = JSON.stringify({ mcpServers: { pencil: { command: "/x", args: [] } }, preferences: { a: 1 } }, null, 2);
    write(f, original);
    const c = CLIENTS["claude-desktop"];
    expect(await c.status(e, cmd)).toBe("available");
    await c.connect(e, cmd);
    await c.connect(e, cmd);
    const after = JSON.parse(readFileSync(f, "utf8"));
    expect(after.preferences).toEqual({ a: 1 });
    expect(after.mcpServers.pencil).toEqual({ command: "/x", args: [] });
    expect(after.mcpServers["sketch-out"]).toEqual({ command: cmd.command, args: ["--mcp"] });
    expect(readFileSync(`${f}.sketchout.bak`, "utf8")).toBe(original);
    expect(await c.status(e, cmd)).toBe("connected");
    expect(await c.status(e, { command: "/elsewhere/Sketch Out", args: ["--mcp"] })).toBe("outdated");
    await c.disconnect(e);
    const gone = JSON.parse(readFileSync(f, "utf8"));
    expect(gone.mcpServers).toEqual({ pencil: { command: "/x", args: [] } });
  });

  it("leaves files it cannot parse untouched", async () => {
    const { e, home } = env();
    const f = desktopFile(home);
    write(f, "{ // komentar\n}");
    const c = CLIENTS["claude-desktop"];
    expect(await c.status(e, cmd)).toBe("unreadable");
    await expect(c.connect(e, cmd)).rejects.toThrow();
    expect(readFileSync(f, "utf8")).toBe("{ // komentar\n}");
  });

  it("is missing when the app's config folder does not exist", async () => {
    const { e } = env();
    expect(await CLIENTS.cursor.status(e, cmd)).toBe("missing");
  });

  it("writes each client's own format", async () => {
    const { e, home } = env();
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, "Library/Application Support/Code/User"), { recursive: true });
    await CLIENTS.opencode.connect(e, cmd);
    await CLIENTS.vscode.connect(e, cmd);
    expect(JSON.parse(readFileSync(join(home, ".config/opencode/opencode.json"), "utf8")).mcp["sketch-out"]).toEqual({
      type: "local", command: [cmd.command, "--mcp"], enabled: true,
    });
    expect(JSON.parse(readFileSync(join(home, "Library/Application Support/Code/User/mcp.json"), "utf8")).servers["sketch-out"]).toEqual({
      type: "stdio", command: cmd.command, args: ["--mcp"],
    });
  });
});

describe("CLI clients", () => {
  it("Claude Code: missing without the CLI, adds at user scope, replaces an outdated entry", async () => {
    expect(await CLIENTS["claude-code"].status(env().e, cmd)).toBe("missing");

    const fresh = env({ bins: ["claude"] });
    expect(await CLIENTS["claude-code"].status(fresh.e, cmd)).toBe("available");
    await CLIENTS["claude-code"].connect(fresh.e, cmd);
    expect(fresh.calls.at(-1)).toEqual(["claude", "mcp", "add", "-s", "user", "sketch-out", "--", cmd.command, "--mcp"]);

    const old = env({ bins: ["claude"], get: () => ({ code: 0, stdout: "sketch-out:\n  Command: /old/Sketch Out\n  Args: --mcp\n" }) });
    expect(await CLIENTS["claude-code"].status(old.e, cmd)).toBe("outdated");
    await CLIENTS["claude-code"].connect(old.e, cmd);
    expect(old.calls.map((c) => c.slice(0, 3).join(" "))).toContain("claude mcp remove");
    expect(old.calls.at(-1)?.slice(0, 3)).toEqual(["claude", "mcp", "add"]);

    const ok = env({ bins: ["claude"], get: () => ({ code: 0, stdout: `Command: ${cmd.command}\nArgs: --mcp\n` }) });
    expect(await CLIENTS["claude-code"].status(ok.e, cmd)).toBe("connected");
  });

  it("Codex: uses codex mcp add/remove", async () => {
    const { e, calls } = env({ bins: ["codex"] });
    await CLIENTS.codex.connect(e, cmd);
    expect(calls.at(-1)).toEqual(["codex", "mcp", "add", "sketch-out", "--", cmd.command, "--mcp"]);
    await CLIENTS.codex.disconnect(e);
    expect(calls.at(-1)).toEqual(["codex", "mcp", "remove", "sketch-out"]);
  });
});

describe("copyText", () => {
  it("gives a shell command and an mcpServers JSON block", () => {
    expect(copyText("command", cmd)).toBe(`'${cmd.command}' --mcp`);
    expect(JSON.parse(copyText("json", cmd))).toEqual({ mcpServers: { "sketch-out": { command: cmd.command, args: ["--mcp"] } } });
  });
});
