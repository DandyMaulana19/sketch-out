/**
 * How to run an AI client's CLI. Pure (no spawning) so each platform's branch is unit-testable.
 *
 * macOS/Linux: through the user's interactive login shell, because GUI apps don't inherit the terminal PATH
 * (nvm, Homebrew…). Windows: through `cmd.exe`, because npm installs CLIs as `.cmd` shims that only a shell
 * can run; GUI apps already get the user's PATH there, so no login shell is needed.
 */
export interface Invocation {
  file: string;
  args: string[];
  /** Windows only: pass `args` to cmd.exe untouched (we quote them ourselves). */
  windowsVerbatimArguments?: boolean;
}

export const posixQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

const CMD_SAFE = /^[A-Za-z0-9_\-.,:\\/@=+]+$/;

/**
 * Quote one argument for a `cmd /d /s /c "…"` line that ends in a program using the usual
 * CommandLineToArgvW rules. Characters cmd would still expand inside quotes (`%`, `!`) and quotes
 * themselves can't be passed safely, so they are refused.
 */
export function cmdQuote(s: string): string {
  if (/["%!\r\n]/.test(s)) throw new Error(`Argumen tidak bisa dipakai di Windows: ${s}`);
  if (s && CMD_SAFE.test(s)) return s;
  // Backslashes right before the closing quote must be doubled, or they would escape it.
  return `"${s.replace(/(\\+)$/, "$1$1")}"`;
}

export function shellInvocation(bin: string, args: string[], platform: NodeJS.Platform, loginShell?: string): Invocation {
  if (platform === "win32") {
    const line = [bin, ...args].map(cmdQuote).join(" ");
    return { file: "cmd.exe", args: ["/d", "/s", "/c", `"${line}"`], windowsVerbatimArguments: true };
  }
  return { file: loginShell || "/bin/zsh", args: ["-ilc", [bin, ...args].map(posixQuote).join(" ")] };
}

/** A command that exits 0 when `bin` is on PATH. */
export function whichInvocation(bin: string, platform: NodeJS.Platform, loginShell?: string): Invocation {
  if (platform === "win32") return { file: "where.exe", args: [bin] };
  return { file: loginShell || "/bin/zsh", args: ["-ilc", `command -v ${posixQuote(bin)}`] };
}
