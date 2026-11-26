import { describe, it, expect } from "vitest";
import { createServer, type Server, type Socket } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { isNamedPipe, socketPath } from "../../src/main/mcp/socketPath";
import { runBridge } from "../../src/main/mcp/bridge";
import { LineTransport } from "../../src/main/mcp/lineTransport";

const sock = () => join(mkdtempSync(join(tmpdir(), "so-mcp-")), "t.sock");
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function echoServer(path: string): Promise<{ server: Server; got: string[] }> {
  const got: string[] = [];
  const server = createServer((s: Socket) => {
    s.setEncoding("utf8");
    s.on("data", (d: string) => {
      got.push(d);
      s.write(d.toUpperCase());
    });
  });
  return new Promise((r) => server.listen(path, () => r({ server, got })));
}

function collect(stream: PassThrough): { text: () => string } {
  let out = "";
  stream.setEncoding("utf8");
  stream.on("data", (d: string) => (out += d));
  return { text: () => out };
}

describe("socketPath", () => {
  it("uses userData when short and a stable tmp path when too long", () => {
    expect(socketPath("/short")).toBe("/short/mcp.sock");
    const long = "/" + "x".repeat(120);
    const p = socketPath(long, "/tmp");
    expect(p.startsWith("/tmp/sketch-out-")).toBe(true);
    expect(p.endsWith(".sock")).toBe(true);
    expect(p.length).toBeLessThanOrEqual(100);
    expect(socketPath(long, "/tmp")).toBe(p);
  });

  it("uses a named pipe on Windows, stable per userData and case-insensitive", () => {
    const ud = "C:\\Users\\Ana\\AppData\\Roaming\\Sketch Out";
    const p = socketPath(ud, "C:\\Temp", "win32");
    expect(p).toMatch(/^\\\\\.\\pipe\\sketch-out-[0-9a-f]{12}$/);
    expect(socketPath(ud.toUpperCase(), "C:\\Temp", "win32")).toBe(p);
    expect(socketPath("C:\\Users\\Budi\\AppData\\Roaming\\Sketch Out", "C:\\Temp", "win32")).not.toBe(p);
    expect(isNamedPipe(p)).toBe(true);
    expect(isNamedPipe(socketPath("/short", "/tmp", "darwin"))).toBe(false);
  });
});

describe("runBridge", () => {
  it("pipes stdin to the socket and the socket to stdout, exiting 0 when stdin ends", async () => {
    const path = sock();
    const { server, got } = await echoServer(path);
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const out = collect(stdout);
    const done = runBridge({ sockPath: path, stdin, stdout, launchApp: () => {} });
    stdin.write('{"a":1}\n{"b":2}\n');
    await wait(200);
    expect(got.join("")).toBe('{"a":1}\n{"b":2}\n');
    expect(out.text()).toBe('{"A":1}\n{"B":2}\n');
    stdin.end();
    expect(await done).toBe(0);
    server.close();
  });

  it("launches the app once and connects when the socket appears", async () => {
    const path = sock();
    let launched = 0;
    let server: Server | null = null;
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const out = collect(stdout);
    const done = runBridge({
      sockPath: path,
      stdin,
      stdout,
      launchApp: () => {
        launched++;
        setTimeout(() => void echoServer(path).then((s) => (server = s.server)), 500);
      },
    });
    stdin.write("hi\n");
    await wait(1200);
    expect(launched).toBe(1);
    expect(out.text()).toBe("HI\n");
    stdin.end();
    expect(await done).toBe(0);
    server!.close();
  });

  it("answers requests with an error when the app cannot be reached", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const out = collect(stdout);
    const done = runBridge({ sockPath: sock(), stdin, stdout, launchApp: () => {}, waitMs: 300 });
    stdin.write('{"jsonrpc":"2.0","id":1,"method":"initialize"}\n{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    await wait(600);
    stdin.end();
    expect(await done).toBe(1);
    const lines = out.text().trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toEqual([{ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "Sketch Out tidak bisa dibuka" } }]);
  });
});

describe("LineTransport", () => {
  it("splits messages by line across chunks and survives bad lines", async () => {
    const duplex = new PassThrough();
    const t = new LineTransport(duplex);
    const msgs: unknown[] = [];
    const errors: Error[] = [];
    t.onmessage = (m) => msgs.push(m);
    t.onerror = (e) => errors.push(e);
    await t.start();
    duplex.write('{"jsonrpc":"2.0","method":"a"}\n{"jsonrpc":"2.0","method":"b"}\n{"jsonrpc":"2.0",');
    duplex.write('"method":"c"}\nnot json\n{"jsonrpc":"2.0","method":"d"}\n');
    await wait(50);
    expect(msgs.map((m) => (m as { method: string }).method)).toEqual(["a", "b", "c", "d"]);
    expect(errors).toHaveLength(1);
  });

  it("writes one JSON message per line", async () => {
    const duplex = new PassThrough();
    const t = new LineTransport(duplex);
    await t.start();
    let written = "";
    duplex.on("data", (d) => (written += d.toString()));
    await t.send({ jsonrpc: "2.0", id: 1, result: {} });
    expect(written).toContain('{"jsonrpc":"2.0","id":1,"result":{}}\n');
  });
});
