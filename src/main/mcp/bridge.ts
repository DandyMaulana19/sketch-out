import { connect as netConnect, type Socket } from "node:net";
import type { Readable, Writable } from "node:stream";

export interface BridgeOptions {
  sockPath: string;
  stdin: Readable;
  stdout: Writable;
  /** Start Sketch Out when it is not running (called at most once). */
  launchApp(): void;
  waitMs?: number;
  connect?: (path: string) => Socket;
}

const RETRY_MS = 250;
const UNREACHABLE = "Sketch Out tidak bisa dibuka";

function tryConnect(path: string, connect: (p: string) => Socket): Promise<Socket | null> {
  return new Promise((resolve) => {
    const s = connect(path);
    s.once("connect", () => {
      s.removeAllListeners("error");
      resolve(s);
    });
    s.once("error", () => resolve(null));
  });
}

/**
 * `Sketch Out --mcp`: relays an MCP client's stdio to the running app's socket.
 * Resolves with the process exit code.
 */
export async function runBridge(opts: BridgeOptions): Promise<number> {
  const connect = opts.connect ?? ((p: string) => netConnect(p));
  const waitMs = opts.waitMs ?? 15_000;
  // Hold stdin until we know where it goes, so nothing is lost while the app starts.
  opts.stdin.pause();
  let ended = false;
  const endedP = new Promise<void>((r) => opts.stdin.once("end", () => ((ended = true), r())));

  let sock = await tryConnect(opts.sockPath, connect);
  if (!sock) {
    opts.launchApp();
    const deadline = Date.now() + waitMs;
    while (!sock && Date.now() < deadline && !ended) {
      await new Promise((r) => setTimeout(r, RETRY_MS));
      sock = await tryConnect(opts.sockPath, connect);
    }
  }

  if (!sock) {
    // Answer every request so the client reports a clear error instead of hanging.
    let buf = "";
    const answer = (line: string) => {
      try {
        const msg = JSON.parse(line);
        if (msg && msg.id !== undefined && msg.method)
          opts.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: UNREACHABLE } }) + "\n");
      } catch {
        /* not JSON: ignore */
      }
    };
    opts.stdin.setEncoding("utf8");
    opts.stdin.on("data", (d: string) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        answer(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    opts.stdin.resume();
    await endedP;
    return 1;
  }

  const s = sock;
  return new Promise<number>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      s.destroy();
      resolve(0);
    };
    s.on("data", (d) => opts.stdout.write(d));
    s.on("close", finish);
    s.on("error", finish);
    opts.stdin.on("data", (d) => s.write(d));
    if (ended) s.end(finish);
    else opts.stdin.once("end", () => s.end(() => setTimeout(finish, 50)));
    opts.stdin.resume();
  });
}
