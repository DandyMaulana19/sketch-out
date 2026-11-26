import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecoveryStore } from "../../src/main/services/recovery";

describe("RecoveryStore", () => {
  it("writes, lists, reads and clears", async () => {
    const r = new RecoveryStore(join(await mkdtemp(join(tmpdir(), "so-rc-")), "recovery"));
    await r.write("aaaaaaaa-1", "{1}");
    expect(await r.list()).toEqual(["aaaaaaaa-1"]);
    expect(await r.read("aaaaaaaa-1")).toBe("{1}");
    await r.clear("aaaaaaaa-1");
    expect(await r.list()).toEqual([]);
  });
  it("rejects ids that could escape the folder", async () => {
    const r = new RecoveryStore(await mkdtemp(join(tmpdir(), "so-rc-")));
    await expect(r.write("../../etc/passwd", "x")).rejects.toThrow("Invalid recovery id");
  });
});
