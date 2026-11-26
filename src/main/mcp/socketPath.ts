import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Unix socket paths are limited to ~104 bytes on macOS. */
const MAX = 100;

/** Where the running app listens for MCP bridges: `<userData>/mcp.sock`, or a stable tmp path when that is too long. */
export function socketPath(userData: string, tmp: string = tmpdir()): string {
  const p = join(userData, "mcp.sock");
  if (p.length <= MAX) return p;
  const h = createHash("sha1").update(userData).digest("hex").slice(0, 12);
  return join(tmp, `sketch-out-${h}.sock`);
}
