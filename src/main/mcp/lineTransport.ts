import type { Duplex } from "node:stream";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/** MCP transport over a byte stream (the app's Unix socket): one JSON-RPC message per line, like stdio. */
export class LineTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private buf = "";

  constructor(private stream: Duplex) {}

  async start(): Promise<void> {
    this.stream.on("data", (d: Buffer | string) => this.read(d.toString()));
    this.stream.on("close", () => this.onclose?.());
    this.stream.on("error", (e: Error) => this.onerror?.(e));
  }

  private read(chunk: string): void {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, "");
      this.buf = this.buf.slice(i + 1);
      if (!line.trim()) continue;
      try {
        this.onmessage?.(JSON.parse(line) as JSONRPCMessage);
      } catch (e) {
        this.onerror?.(e instanceof Error ? e : new Error(String(e)));
      }
    }
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.stream.destroyed) return reject(new Error("closed"));
      this.stream.write(JSON.stringify(message) + "\n", (err) => (err ? reject(err) : resolve()));
    });
  }

  async close(): Promise<void> {
    this.stream.end();
  }
}
