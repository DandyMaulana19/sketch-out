import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DocumentSession, type DocSink } from "../../src/renderer/doc/documentSession";

type El = { id: string; version: number };
const fingerprint = (els: readonly El[]) => els.map((e) => `${e.id}:${e.version}`).join(",");
const serialize = (els: readonly El[]) => JSON.stringify(els);

function setup(sink: DocSink) {
  const statuses: string[] = [];
  const s = new DocumentSession<El>({
    sink,
    delayMs: 1000,
    fingerprint: (els) => fingerprint(els),
    serialize: (els) => serialize(els),
    onStatus: (st) => statuses.push(st.status + (st.error ? `:${st.error}` : "")),
  });
  return { s, statuses };
}

describe("DocumentSession", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("debounces saves to one write 1000 ms after the last change", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { s } = setup({ save });
    s.onChange([{ id: "a", version: 1 }], {}, {});
    await vi.advanceTimersByTimeAsync(250);
    s.onChange([{ id: "a", version: 2 }], {}, {});
    await vi.advanceTimersByTimeAsync(250);
    s.onChange([{ id: "a", version: 3 }], {}, {});
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(serialize([{ id: "a", version: 3 }]));
  });

  it("ignores changes that only touch volatile appState (same fingerprint)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { s } = setup({ save });
    s.markSaved([{ id: "a", version: 1 }], {});
    s.onChange([{ id: "a", version: 1 }], { scrollX: 10 }, {});
    s.onChange([{ id: "a", version: 1 }], { zoom: 2 }, {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it("detects newly added files even when elements are unchanged", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { s } = setup({ save });
    s.markSaved([{ id: "a", version: 1 }], {});
    s.onChange([{ id: "a", version: 1 }], {}, { f1: {} });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reports 'File tidak ditemukan' when the sink says the file is missing", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Error invoking remote method 'files:write': LocalFileMissingError: File tidak ditemukan: /x"));
    const { s, statuses } = setup({ save });
    s.onChange([{ id: "a", version: 1 }], {}, {});
    await vi.advanceTimersByTimeAsync(1000);
    expect(statuses.at(-1)).toBe("error:File tidak ditemukan");
  });

  it("saves again when changes arrive during an in-flight save", async () => {
    let release!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockResolvedValue(undefined);
    const { s, statuses } = setup({ save });
    s.onChange([{ id: "a", version: 1 }], {}, {});
    await vi.advanceTimersByTimeAsync(1000);
    s.onChange([{ id: "a", version: 2 }], {}, {});
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(serialize([{ id: "a", version: 2 }]));
    expect(statuses.at(-1)).toBe("saved");
  });

  it("flush() writes pending changes immediately", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { s } = setup({ save });
    s.onChange([{ id: "a", version: 1 }], {}, {});
    await s.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("returns to 'saved' when an edit is undone before the autosave fires", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { s, statuses } = setup({ save });
    s.markSaved([{ id: "a", version: 1 }], {});
    s.onChange([{ id: "a", version: 2 }], {}, {});
    s.onChange([{ id: "a", version: 1 }], {}, {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toBe("saved");
    expect(s.hasUnsavedChanges).toBe(false);
  });
});

