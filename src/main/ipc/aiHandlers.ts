import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { app, clipboard } from "electron";
import { z } from "zod";
import { handle } from "./register";
import { CLIENT_IDS, CLIENTS, copyText, type ClientEnv, type ClientId, type McpCommand } from "../ai/clients";
import { shellInvocation, whichInvocation, type Invocation } from "../ai/shell";

const EXEC_TIMEOUT_MS = 20_000;

/** The command AI clients run to reach this app. */
export function mcpCommand(): McpCommand {
  return app.isPackaged
    ? { command: app.getPath("exe"), args: ["--mcp"] }
    : { command: process.execPath, args: [app.getAppPath(), "--mcp"] };
}

/** Run a CLI the platform's way (see ai/shell.ts): login shell on macOS/Linux, cmd.exe on Windows. */
function run(inv: Invocation): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(inv.file, inv.args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
      windowsHide: true,
      windowsVerbatimArguments: inv.windowsVerbatimArguments,
    });
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

const tryRun = (make: () => Invocation) => {
  try {
    return run(make());
  } catch (e) {
    return Promise.resolve({ code: 1, stdout: String((e as Error).message) });
  }
};

const realEnv: ClientEnv = {
  home: homedir(),
  platform: process.platform,
  appData: process.env.APPDATA,
  exec: (bin, args) => tryRun(() => shellInvocation(bin, args, process.platform, process.env.SHELL)),
  which: async (bin) => (await tryRun(() => whichInvocation(bin, process.platform, process.env.SHELL))).code === 0,
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
