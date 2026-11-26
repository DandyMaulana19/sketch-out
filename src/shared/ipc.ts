/** Every invoke channel the renderer may call, as "<namespace>:<method>". */
export const CHANNELS = [
  "files:openDialog",
  "files:read",
  "files:write",
  "files:saveAsDialog",
  "files:statMtime",
  "files:recent",
  "files:writeRecovery",
  "files:readRecovery",
  "files:clearRecovery",
  "app:getInitialDoc",
  "app:setDocState",
  "app:openDocument",
  "app:newWindow",
  "app:closeWindow",
  "app:closeCancelled",
  "app:getPrefs",
  "app:setPrefs",
  "app:loadLibrary",
  "app:saveLibrary",
  "auth:signIn",
  "auth:signOut",
  "auth:status",
  "drive:list",
  "drive:open",
  "drive:openInWindow",
  "drive:readCached",
  "drive:create",
  "drive:rename",
  "drive:trash",
  "sync:save",
  "sync:syncNow",
  "sync:getState",
  "sync:dismissNotice",
  "sync:reportOnline",
  "sync:pendingCount",
] as const satisfies readonly string[];
export type Channel = (typeof CHANNELS)[number];

/** Events main → renderer. */
export const EVENTS = ["sync:state", "menu:command", "library:add", "doc:open"] as const;
export type AppEvent = (typeof EVENTS)[number];
