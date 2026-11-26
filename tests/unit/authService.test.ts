import { describe, it, expect, vi } from "vitest";
import { AuthService } from "../../src/main/services/auth/authService";
import { AuthRequiredError, DriveNetworkError } from "../../src/main/services/errors";
import type { StoredAuth } from "../../src/main/services/auth/tokenStore";

function memStore(initial: StoredAuth | null = null) {
  let v = initial;
  return {
    load: vi.fn(async () => v),
    save: vi.fn(async (x: StoredAuth) => void (v = x)),
    clear: vi.fn(async () => void (v = null)),
  };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function setup(opts: { store?: ReturnType<typeof memStore>; fetch?: typeof fetch } = {}) {
  const store = opts.store ?? memStore();
  let opened = "";
  const fetchFn =
    opts.fetch ??
    (vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "at1", expires_in: 3600, refresh_token: "rt1" });
      if (u.startsWith("https://www.googleapis.com/oauth2/v3/userinfo")) return json({ email: "me@example.com" });
      if (u.startsWith("https://oauth2.googleapis.com/revoke")) return new Response("", { status: 200 });
      throw new Error("unexpected " + u);
    }) as unknown as typeof fetch);
  const auth = new AuthService({
    clientId: "cid",
    clientSecret: "csecret",
    store,
    fetch: fetchFn,
    openExternal: async (u) => void (opened = u),
    now: () => 1_000_000,
  });
  return { auth, store, fetchFn, opened: () => opened };
}

async function waitFor<T>(fn: () => T): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timeout");
}

describe("AuthService.signIn", () => {
  it("opens a PKCE authorization URL with a loopback redirect and the drive.file scope", async () => {
    const { auth, opened } = setup();
    const p = auth.signIn();
    const url = new URL(await waitFor(opened));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")!.split(" ")).toEqual(expect.arrayContaining(["https://www.googleapis.com/auth/drive.file", "openid", "email"]));
    expect(url.searchParams.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    await fetch(`${url.searchParams.get("redirect_uri")}/?code=abc&state=${url.searchParams.get("state")}`);
    await expect(p).resolves.toEqual({ email: "me@example.com" });
  });

  it("stores the refresh token after a successful callback", async () => {
    const { auth, store, opened } = setup();
    const p = auth.signIn();
    const url = new URL(await waitFor(opened));
    await fetch(`${url.searchParams.get("redirect_uri")}/?code=abc&state=${url.searchParams.get("state")}`);
    await p;
    expect(store.save).toHaveBeenCalledWith({ refreshToken: "rt1", email: "me@example.com" });
  });

  it("rejects a callback with the wrong state", async () => {
    const { auth, opened } = setup();
    const p = auth.signIn();
    const url = new URL(await waitFor(opened));
    const res = fetch(`${url.searchParams.get("redirect_uri")}/?code=abc&state=forged`).catch(() => null);
    await expect(p).rejects.toThrow("state");
    await res;
  });
});

describe("AuthService.getAccessToken", () => {
  it("refreshes with the stored refresh token and caches the result", async () => {
    const fetchFn = vi.fn(async () => json({ access_token: "at2", expires_in: 3600 })) as unknown as typeof fetch;
    const { auth } = setup({ store: memStore({ refreshToken: "rt", email: "me@example.com" }), fetch: fetchFn });
    expect(await auth.getAccessToken()).toBe("at2");
    expect(await auth.getAccessToken()).toBe("at2");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("forceRefresh bypasses the cache", async () => {
    const fetchFn = vi.fn(async () => json({ access_token: "at2", expires_in: 3600 })) as unknown as typeof fetch;
    const { auth } = setup({ store: memStore({ refreshToken: "rt", email: null }), fetch: fetchFn });
    await auth.getAccessToken();
    await auth.getAccessToken({ forceRefresh: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it("clears credentials and throws AuthRequiredError on invalid_grant", async () => {
    const store = memStore({ refreshToken: "rt", email: null });
    const { auth } = setup({ store, fetch: (async () => json({ error: "invalid_grant" }, 400)) as unknown as typeof fetch });
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
    expect(store.clear).toHaveBeenCalled();
  });
  it("throws AuthRequiredError when never signed in", async () => {
    const { auth } = setup();
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(AuthRequiredError);
  });
  it("maps network failures to DriveNetworkError and keeps credentials", async () => {
    const store = memStore({ refreshToken: "rt", email: null });
    const { auth } = setup({ store, fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
    await expect(auth.getAccessToken()).rejects.toBeInstanceOf(DriveNetworkError);
    expect(store.clear).not.toHaveBeenCalled();
  });
});

describe("AuthService.signOut", () => {
  it("revokes the token and clears storage", async () => {
    const store = memStore({ refreshToken: "rt", email: "me@example.com" });
    const { auth, fetchFn } = setup({ store });
    await auth.signOut();
    expect(String((fetchFn as any).mock.calls[0][0])).toContain("https://oauth2.googleapis.com/revoke");
    expect(store.clear).toHaveBeenCalled();
    expect(await auth.status()).toEqual({ signedIn: false, email: null });
  });
});
