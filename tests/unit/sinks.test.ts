import { describe, it, expect, vi } from "vitest";
import { makeLocalSink } from "../../src/renderer/doc/sinks";

const api = () => ({
  files: { write: vi.fn().mockResolvedValue({ mtimeMs: 42 }), writeRecovery: vi.fn().mockResolvedValue(undefined), clearRecovery: vi.fn().mockResolvedValue(undefined) },
});

describe("makeLocalSink", () => {
  it("writes untitled documents to the recovery store, not to a path", async () => {
    const a = api();
    const json = JSON.stringify({ type: "excalidraw", elements: [{ id: "a", isDeleted: false }] });
    await makeLocalSink(a as any, { path: null, recoveryId: "r1" }, () => {}).save(json);
    expect(a.files.writeRecovery).toHaveBeenCalledWith({ recoveryId: "r1", json });
    expect(a.files.write).not.toHaveBeenCalled();
  });
  it("writes titled documents to their path and reports the new mtime", async () => {
    const a = api();
    const onMtime = vi.fn();
    await makeLocalSink(a as any, { path: "/x.excalidraw", recoveryId: null }, onMtime).save("{}");
    expect(a.files.write).toHaveBeenCalledWith({ path: "/x.excalidraw", json: "{}" });
    expect(onMtime).toHaveBeenCalledWith(42);
  });
  it("does not keep a recovery copy of an empty untitled canvas", async () => {
    const a = api();
    const empty = JSON.stringify({ type: "excalidraw", elements: [{ id: "x", isDeleted: true }] });
    await makeLocalSink(a as any, { path: null, recoveryId: "r1" }, () => {}).save(empty);
    expect(a.files.writeRecovery).not.toHaveBeenCalled();
    expect(a.files.clearRecovery).toHaveBeenCalledWith({ recoveryId: "r1" });
  });
});

