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
  const set = (v: boolean) => {
    if (v === online) return;
    online = v;
    opts.onChange(v);
  };
  const timer = setInterval(() => set(opts.isOnline()), opts.pollMs ?? 15_000);
  return { current: () => online, report: set, stop: () => clearInterval(timer) };
}
