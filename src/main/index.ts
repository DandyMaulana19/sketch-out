import { spawn } from "node:child_process";
import { app } from "electron";
import { runBridge } from "./mcp/bridge";
import { socketPath } from "./mcp/socketPath";
import { startApp } from "./app";

if (process.env.SKETCHOUT_USER_DATA) app.setPath("userData", process.env.SKETCHOUT_USER_DATA);

if (process.argv.includes("--mcp")) {
  // An AI client launched us as its MCP server: relay stdio to the running app (starting it if needed).
  app.dock?.hide();
  const args = process.argv.slice(1).filter((a) => a !== "--mcp");
  void runBridge({
    sockPath: socketPath(app.getPath("userData")),
    stdin: process.stdin,
    stdout: process.stdout,
    launchApp: () => spawn(process.execPath, args, { detached: true, stdio: "ignore", env: process.env }).unref(),
  }).then((code) => app.exit(code));
} else {
  startApp();
}
