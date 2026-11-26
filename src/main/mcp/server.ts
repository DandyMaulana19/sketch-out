import { chmodSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LineTransport } from "./lineTransport";
import { isNamedPipe } from "./socketPath";

/** Listen on the Unix socket (named pipe on Windows) that `Sketch Out --mcp` bridges connect to; one MCP session per connection. */
export function startMcpServer(sockPath: string, makeServer: () => McpServer): () => void {
  const onDisk = !isNamedPipe(sockPath);
  if (onDisk) rmSync(sockPath, { force: true }); // stale socket from a crash
  const sockets = new Set<Socket>();
  const server = createServer((sock) => {
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => sock.destroy());
    void makeServer()
      .connect(new LineTransport(sock))
      .catch(() => sock.destroy());
  });
  server.on("error", () => {});
  server.listen(sockPath, () => {
    if (!onDisk) return; // a named pipe has no file mode; Windows applies its default pipe ACL
    try {
      chmodSync(sockPath, 0o600);
    } catch {
      /* best effort; the folder is already private to the user */
    }
  });
  return () => {
    for (const s of sockets) s.destroy();
    server.close();
    if (onDisk) rmSync(sockPath, { force: true });
  };
}
