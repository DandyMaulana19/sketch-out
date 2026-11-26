import { contextBridge, ipcRenderer } from "electron";
import { CHANNELS, EVENTS, type AppEvent } from "../shared/ipc";

const api: Record<string, unknown> = {
  on(event: AppEvent, cb: (payload: unknown) => void) {
    if (!(EVENTS as readonly string[]).includes(event)) throw new Error(`Unknown event ${event}`);
    const listener = (_e: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
};

for (const channel of CHANNELS as readonly string[]) {
  const [ns, method] = channel.split(":");
  const target = (api[ns] ??= {}) as Record<string, unknown>;
  target[method] = (input?: unknown) => ipcRenderer.invoke(channel, input);
}

contextBridge.exposeInMainWorld("sketchOut", api);
