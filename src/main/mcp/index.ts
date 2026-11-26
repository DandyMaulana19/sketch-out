import { app } from "electron";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAppStore } from "../services/appStores";
import { createNote, listNotes } from "../services/folders";
import { serializeEmpty } from "./emptyScene";
import { describeWindows } from "../windows";
import { createRouter } from "./router";
import { startMcpServer } from "./server";
import { socketPath } from "./socketPath";
import { registerTools } from "./tools";

const INSTRUCTIONS = `Sketch Out is an Excalidraw whiteboard. Notes are .excalidraw files the user opened (single files or folders).
Call get_workspace first, then list_notes for a folder. Paths are absolute. Coordinates are canvas pixels, y grows downward.
Edits appear live in the user's window and each tool call is one undo step. Elements without x/y are placed below existing content.
Use view_note to check the result visually.`;

/** Start the MCP endpoint used by AI clients through `Sketch Out --mcp`. Returns a stop function. */
export function startMcp(): () => void {
  const router = createRouter();
  const makeServer = () => {
    const server = new McpServer({ name: "sketch-out", version: app.getVersion() }, { instructions: INSTRUCTIONS });
    registerTools(server, {
      router,
      workspace: () => ({ windows: describeWindows(), recentFolders: getAppStore().get().recentFolders }),
      listNotes,
      createNote: (dir, name) => createNote(dir, name, serializeEmpty()),
      openNote: async (path) => {
        await router.request(path, "read");
      },
    });
    return server;
  };
  return startMcpServer(socketPath(app.getPath("userData")), makeServer);
}
