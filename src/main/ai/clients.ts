import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWriteFile } from "../services/atomicWrite";

/** Registers Sketch Out's MCP server with AI clients. Pure Node: the Electron-specific bits live in ipc/aiHandlers.ts. */
export type ClientId = "claude-code" | "codex" | "claude-desktop" | "opencode" | "gemini" | "cursor" | "vscode";
export type ClientStatus = "missing" | "available" | "connected" | "outdated" | "unreadable";
export interface McpCommand {
  command: string;
  args: string[];
}
export interface ClientEnv {
  home: string;
  /** Runs a CLI through the user's login shell (GUI apps don't inherit the terminal PATH). */
  exec(bin: string, args: string[]): Promise<{ code: number; stdout: string }>;
  which(bin: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
}
export interface Client {
  label: string;
  restartNote?: string;
  status(env: ClientEnv, cmd: McpCommand): Promise<ClientStatus>;
  connect(env: ClientEnv, cmd: McpCommand): Promise<void>;
  disconnect(env: ClientEnv): Promise<void>;
}

export const SERVER_NAME = "sketch-out";
export const CLIENT_IDS: ClientId[] = ["claude-code", "codex", "claude-desktop", "opencode", "gemini", "cursor", "vscode"];

// ---- JSON config files -------------------------------------------------------------------------

class Unreadable extends Error {
  constructor(file: string) {
    super(`File pengaturan tidak bisa dibaca: ${file}. Pakai "Salin JSON" dan tambahkan secara manual.`);
  }
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return null; // no file yet
  }
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new Unreadable(file);
}

/** Set (or with `value` undefined, remove) `keys` in a JSON file, touching nothing else. Backs the file up once. */
export async function editJsonConfig(file: string, keys: string[], value: unknown): Promise<void> {
  const data = (await readJson(file)) ?? {};
  let node = data;
  for (const k of keys.slice(0, -1)) {
    if (!node[k] || typeof node[k] !== "object") node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (value === undefined) delete node[last];
  else node[last] = value;
  await mkdir(dirname(file), { recursive: true });
  try {
    await copyFile(file, `${file}.sketchout.bak`, 1 /* COPYFILE_EXCL: keep the first backup */);
  } catch {
    /* no original file, or already backed up */
  }
  await atomicWriteFile(file, JSON.stringify(data, null, 2) + "\n");
}

function jsonClient(o: { label: string; restartNote?: string; dir: (home: string) => string; file: string; keys: string[]; entry: (c: McpCommand) => unknown }): Client {
  const path = (home: string) => join(o.dir(home), o.file);
  return {
    label: o.label,
    restartNote: o.restartNote,
    async status(env, cmd) {
      const file = path(env.home);
      if (!(await env.exists(o.dir(env.home))) && !(await env.exists(file))) return "missing";
      let data: Record<string, unknown> | null;
      try {
        data = await readJson(file);
      } catch {
        return "unreadable";
      }
      let node: unknown = data;
      for (const k of o.keys) node = node && typeof node === "object" ? (node as Record<string, unknown>)[k] : undefined;
      if (node === undefined) return "available";
      return JSON.stringify(node) === JSON.stringify(o.entry(cmd)) ? "connected" : "outdated";
    },
    connect: (env, cmd) => editJsonConfig(path(env.home), o.keys, o.entry(cmd)),
    async disconnect(env) {
      if (await env.exists(path(env.home))) await editJsonConfig(path(env.home), o.keys, undefined);
    },
  };
}

const mcpServersEntry = (c: McpCommand) => ({ command: c.command, args: c.args });

// ---- CLI-managed clients ---------------------------------------------------------------------------

function cliClient(o: { label: string; bin: string; addArgs: (c: McpCommand) => string[]; removeArgs: string[]; getArgs: string[] }): Client {
  const status = async (env: ClientEnv, cmd: McpCommand): Promise<ClientStatus> => {
    if (!(await env.which(o.bin))) return "missing";
    const r = await env.exec(o.bin, o.getArgs);
    if (r.code !== 0) return "available";
    return r.stdout.includes(cmd.command) ? "connected" : "outdated";
  };
  return {
    label: o.label,
    status,
    async connect(env, cmd) {
      const s = await status(env, cmd);
      if (s === "connected") return;
      if (s === "outdated") await env.exec(o.bin, o.removeArgs);
      const r = await env.exec(o.bin, o.addArgs(cmd));
      if (r.code !== 0) throw new Error(`${o.label} menolak pendaftaran: ${r.stdout.trim().slice(0, 300)}`);
    },
    async disconnect(env) {
      await env.exec(o.bin, o.removeArgs);
    },
  };
}

const appSupport = (home: string, ...p: string[]) => join(home, "Library", "Application Support", ...p);

export const CLIENTS: Record<ClientId, Client> = {
  "claude-code": cliClient({
    label: "Claude Code",
    bin: "claude",
    addArgs: (c) => ["mcp", "add", "-s", "user", SERVER_NAME, "--", c.command, ...c.args],
    removeArgs: ["mcp", "remove", "-s", "user", SERVER_NAME],
    getArgs: ["mcp", "get", SERVER_NAME],
  }),
  codex: cliClient({
    label: "Codex",
    bin: "codex",
    addArgs: (c) => ["mcp", "add", SERVER_NAME, "--", c.command, ...c.args],
    removeArgs: ["mcp", "remove", SERVER_NAME],
    getArgs: ["mcp", "get", SERVER_NAME],
  }),
  "claude-desktop": jsonClient({
    label: "Claude Desktop",
    restartNote: "Tutup lalu buka lagi Claude Desktop supaya Sketch Out terbaca.",
    dir: (h) => appSupport(h, "Claude"),
    file: "claude_desktop_config.json",
    keys: ["mcpServers", SERVER_NAME],
    entry: mcpServersEntry,
  }),
  opencode: jsonClient({
    label: "OpenCode",
    restartNote: "Mulai sesi OpenCode baru supaya Sketch Out terbaca.",
    dir: (h) => join(h, ".config", "opencode"),
    file: "opencode.json",
    keys: ["mcp", SERVER_NAME],
    entry: (c) => ({ type: "local", command: [c.command, ...c.args], enabled: true }),
  }),
  gemini: jsonClient({
    label: "Gemini CLI",
    restartNote: "Mulai sesi Gemini CLI baru supaya Sketch Out terbaca.",
    dir: (h) => join(h, ".gemini"),
    file: "settings.json",
    keys: ["mcpServers", SERVER_NAME],
    entry: mcpServersEntry,
  }),
  cursor: jsonClient({
    label: "Cursor",
    restartNote: "Muat ulang Cursor supaya Sketch Out terbaca.",
    dir: (h) => join(h, ".cursor"),
    file: "mcp.json",
    keys: ["mcpServers", SERVER_NAME],
    entry: mcpServersEntry,
  }),
  vscode: jsonClient({
    label: "VS Code",
    restartNote: "Muat ulang jendela VS Code supaya Sketch Out terbaca.",
    dir: (h) => appSupport(h, "Code", "User"),
    file: "mcp.json",
    keys: ["servers", SERVER_NAME],
    entry: (c) => ({ type: "stdio", command: c.command, args: c.args }),
  }),
};

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** For AI clients not in the list. */
export function copyText(kind: "command" | "json", cmd: McpCommand): string {
  if (kind === "command") return [shellQuote(cmd.command), ...cmd.args].join(" ");
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: mcpServersEntry(cmd) } }, null, 2);
}
