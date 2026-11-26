import { mkdir, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { atomicWriteFile } from "../atomicWrite";

export interface StoredAuth {
  refreshToken: string;
  email: string | null;
}
export interface SecretCrypto {
  available(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}
export interface TokenStore {
  load(): Promise<StoredAuth | null>;
  save(v: StoredAuth): Promise<void>;
  clear(): Promise<void>;
}

/** Refresh token encrypted with the OS keychain (Electron safeStorage). Never stored as plaintext. */
export function createTokenStore(file: string, crypto: SecretCrypto): TokenStore {
  return {
    async load() {
      try {
        const v = JSON.parse(crypto.decrypt(Buffer.from(await readFile(file, "utf8"), "base64")));
        return typeof v?.refreshToken === "string" ? { refreshToken: v.refreshToken, email: v.email ?? null } : null;
      } catch {
        return null;
      }
    },
    async save(v) {
      if (!crypto.available()) throw new Error("Penyimpanan aman tidak tersedia");
      await mkdir(dirname(file), { recursive: true });
      await atomicWriteFile(file, crypto.encrypt(JSON.stringify(v)).toString("base64"));
    },
    async clear() {
      await unlink(file).catch(() => {});
    },
  };
}
