import { join } from "node:path";
import { app, net, safeStorage, shell } from "electron";
import { AuthService } from "./authService";
import { createTokenStore } from "./tokenStore";

let auth: AuthService | null = null;

export function getAuth(): AuthService {
  auth ??= new AuthService({
    clientId: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_ID ?? "",
    clientSecret: import.meta.env.MAIN_VITE_GOOGLE_CLIENT_SECRET ?? "",
    store: createTokenStore(join(app.getPath("userData"), "auth.bin"), {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (s) => safeStorage.encryptString(s),
      decrypt: (b) => safeStorage.decryptString(b),
    }),
    fetch: (input, init) => net.fetch(input as string, init),
    openExternal: (url) => shell.openExternal(url),
    now: () => Date.now(),
  });
  return auth;
}
