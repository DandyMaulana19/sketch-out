export interface Connectivity {
  current(): boolean;
  report(online: boolean): void;
  stop(): void;
}

/**
 * Coarse online signal: OS reachability (net.isOnline) polled, plus `online`/`offline` events
 * forwarded from renderers. Real request failures are the final word (handled by SyncEngine).
 */
export function createConnectivity(opts: { isOnline(): boolean; onChange(online: boolean): void; pollMs?: number }): Connectivity {
  let online = opts.isOnline();
  let lastOs = online;
  const set = (v: boolean) => {
    if (v === online) return;
    online = v;
    opts.onChange(v);
  };
  // A poll only matters when the OS answer itself changes; otherwise a renderer report stands.
  const timer = setInterval(() => {
    const os = opts.isOnline();
    if (os !== lastOs) {
      lastOs = os;
      set(os);
    }
  }, opts.pollMs ?? 15_000);
  return { current: () => online, report: set, stop: () => clearInterval(timer) };
}
