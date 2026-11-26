import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTokenStore } from "../../src/main/services/auth/tokenStore";

const fakeCrypto = (available = true) => ({
  available: () => available,
  encrypt: (s: string) => Buffer.from(s.split("").reverse().join(""), "utf8"),
  decrypt: (b: Buffer) => b.toString("utf8").split("").reverse().join(""),
});

describe("tokenStore", () => {
  it("round-trips and never writes plaintext", async () => {
    const f = join(await mkdtemp(join(tmpdir(), "so-ts-")), "auth.bin");
    const s = createTokenStore(f, fakeCrypto());
    await s.save({ refreshToken: "1//secret-refresh", email: "me@example.com" });
    expect(await s.load()).toEqual({ refreshToken: "1//secret-refresh", email: "me@example.com" });
    expect(await readFile(f, "utf8")).not.toContain("secret-refresh");
    await s.clear();
    expect(await s.load()).toBeNull();
  });
  it("refuses to save when secure storage is unavailable", async () => {
    const f = join(await mkdtemp(join(tmpdir(), "so-ts-")), "auth.bin");
    await expect(createTokenStore(f, fakeCrypto(false)).save({ refreshToken: "x", email: null })).rejects.toThrow("Penyimpanan aman tidak tersedia");
  });
});
