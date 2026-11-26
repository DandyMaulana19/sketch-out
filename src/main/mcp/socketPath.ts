import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Unix socket paths are limited to ~104 bytes on macOS. */
const MAX = 100;

const hashOf = (userData: string) => createHash("sha1").update(userData).digest("hex").slice(0, 12);

/**
 * Where the running app listens for MCP bridges.
 * Windows: a named pipe `\\.\pipe\sketch-out-<hash of userData>` (the hash ignores case, as Windows paths do).
 * Elsewhere: `<userData>/mcp.sock`, or a stable tmp path when that is too long for a Unix socket.
 */
export function socketPath(userData: string, tmp: string = tmpdir(), platform: NodeJS.Platform = process.platform): string {
  if (platform === "win32") return `\\\\.\\pipe\\sketch-out-${hashOf(userData.toLowerCase())}`;
  const p = join(userData, "mcp.sock");
  if (p.length <= MAX) return p;
  return join(tmp, `sketch-out-${hashOf(userData)}.sock`);
}

/** Named pipes live in the kernel's pipe namespace, not on disk: nothing to delete or chmod. */
export const isNamedPipe = (p: string): boolean => p.startsWith("\\\\.\\pipe\\") || p.startsWith("\\\\?\\pipe\\");
