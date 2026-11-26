import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { app, clipboard } from "electron";
import { z } from "zod";
import { handle } from "./register";
import { CLIENT_IDS, CLIENTS, copyText, type ClientEnv, type ClientId, type McpCommand } from "../ai/clients";

const EXEC_TIMEOUT_MS = 20_000;
const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** The command AI clients run to reach this app. */
export function mcpCommand(): McpCommand {
  return app.isPackaged
    ? { command: app.getPath("exe"), args: ["--mcp"] }
    : { command: process.execPath, args: [app.getAppPath(), "--mcp"] };
}

/** Run through an interactive login shell so CLIs installed via nvm, Homebrew, etc. are on PATH. */
function shell(line: string): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const sh = process.env.SHELL || "/bin/zsh";
    const child = spawn(sh, ["-ilc", line], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), EXEC_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: out });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: out });
    });
  });
}

const realEnv: ClientEnv = {
  home: homedir(),
  exec: (bin, args) => shell([bin, ...args].map(quote).join(" ")),
  which: async (bin) => (await shell(`command -v ${quote(bin)}`)).code === 0,
  exists: (p) => access(p).then(() => true, () => false),
};

const clientId = z.enum(CLIENT_IDS as [ClientId, ...ClientId[]]);

async function describe(id: ClientId) {
  const c = CLIENTS[id];
  return { id, label: c.label, restartNote: c.restartNote ?? null, status: await c.status(realEnv, mcpCommand()) };
}

export function registerAiHandlers(): void {
  handle("ai:clients", z.undefined(), () => Promise.all(CLIENT_IDS.map(describe)));
  handle("ai:connect", z.object({ id: clientId }), async ({ id }) => {
    await CLIENTS[id].connect(realEnv, mcpCommand());
    return describe(id);
  });
  handle("ai:disconnect", z.object({ id: clientId }), async ({ id }) => {
    await CLIENTS[id].disconnect(realEnv);
    return describe(id);
  });
  handle("ai:copyConfig", z.object({ kind: z.enum(["command", "json"]) }), ({ kind }) => {
    const text = copyText(kind, mcpCommand());
    clipboard.writeText(text);
    return text;
  });
}
