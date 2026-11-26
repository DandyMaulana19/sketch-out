import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DocumentSession } from "../../src/renderer/doc/documentSession";
import { makeDriveSink } from "../../src/renderer/doc/sinks";
import { driveBadge } from "../../src/renderer/components/SyncBadge";
import type { SyncState } from "../../src/shared/types";

const st = (p: Partial<SyncState>): SyncState => ({ localId: "L", status: "synced", lastSyncedAt: null, error: null, notice: null, ...p });

describe("drive document session", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("writes to the offline cache through sync.save once, 500 ms after the last change", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const s = new DocumentSession<{ v: number }>({
      sink: makeDriveSink({ sync: { save } } as any, "L"),
      delayMs: 500,
      fingerprint: (els) => els.map((e) => e.v).join(),
      serialize: (els) => JSON.stringify(els),
      onStatus: () => {},
    });
    s.onChange([{ v: 1 }], {}, {});
    await vi.advanceTimersByTimeAsync(300);
    s.onChange([{ v: 2 }], {}, {});
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ localId: "L", json: JSON.stringify([{ v: 2 }]) });
  });
});

describe("driveBadge", () => {
  const actions = { syncNow: vi.fn(), signIn: vi.fn() };
  it("maps sync states to the spec's labels", () => {
    expect(driveBadge(st({ status: "synced" }), actions)).toMatchObject({ tone: "ok", label: "Tersimpan ke Drive" });
    expect(driveBadge(st({ status: "pending" }), actions)).toMatchObject({ tone: "busy", label: "Menyinkron…" });
    expect(driveBadge(st({ status: "syncing" }), actions)).toMatchObject({ tone: "busy", label: "Menyinkron…" });
    expect(driveBadge(st({ status: "offline" }), actions)).toMatchObject({ tone: "offline", label: "Offline — tersimpan di perangkat" });
  });
  it("offers 'Login ulang' when credentials expired", () => {
    const b = driveBadge(st({ status: "error", error: "Perlu login ulang" }), actions);
    expect(b).toMatchObject({ tone: "error", label: "Perlu login ulang" });
    b.action!.run();
    expect(actions.signIn).toHaveBeenCalled();
  });
  it("clicking the badge triggers an immediate sync", () => {
    driveBadge(st({ status: "offline" }), actions).onClick!();
    expect(actions.syncNow).toHaveBeenCalled();
  });
});
