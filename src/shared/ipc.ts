/** Every invoke channel the renderer may call, as "<namespace>:<method>". */
export const CHANNELS = [] as const satisfies readonly string[];
export type Channel = (typeof CHANNELS)[number];

/** Events main → renderer. */
export const EVENTS = ["sync:state", "menu:command", "library:add", "doc:open"] as const;
export type AppEvent = (typeof EVENTS)[number];
