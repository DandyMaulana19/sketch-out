import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { AuthRequiredError, DriveNetworkError } from "../errors";
import { createPkcePair } from "./pkce";
import type { TokenStore } from "./tokenStore";

export const SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email"];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const EXPIRY_MARGIN_MS = 60 * 1000;

export interface AuthDeps {
  clientId: string;
  clientSecret: string;
  store: TokenStore;
  fetch: typeof fetch;
  openExternal(url: string): Promise<void>;
  now(): number;
}

const SUCCESS_HTML = `<!doctype html><meta charset="utf-8"><title>Sketch Out</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#f7f7fb;color:#1b1b1f">
<div style="text-align:center"><h1 style="font-weight:600">Login berhasil</h1><p>Kamu bisa menutup tab ini dan kembali ke Sketch Out.</p></div></body>`;

export class AuthService {
  private access: { token: string; expiresAt: number } | null = null;
  private refreshing: Promise<string> | null = null;
  private pendingServer: Server | null = null;

  constructor(private deps: AuthDeps) {}

  async status(): Promise<{ signedIn: boolean; email: string | null }> {
    const s = await this.deps.store.load();
    return { signedIn: !!s, email: s?.email ?? null };
  }

  async signIn(): Promise<{ email: string | null }> {
    if (!this.deps.clientId) throw new Error("Google Client ID belum diatur (lihat README)");
    this.pendingServer?.close();
    const { verifier, challenge } = createPkcePair();
    const state = randomBytes(16).toString("base64url");
    const server = createServer();
    this.pendingServer = server;
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error("Login dibatalkan (waktu habis)")), SIGN_IN_TIMEOUT_MS);
      const finish = (err: Error | null, value?: string) => {
        clearTimeout(timer);
        server.close();
        if (this.pendingServer === server) this.pendingServer = null;
        if (err) reject(err);
        else resolve(value!);
      };
      server.on("request", (req, res) => {
        const url = new URL(req.url ?? "/", redirectUri);
        if (url.pathname !== "/") return void res.writeHead(404).end();
        const err = url.searchParams.get("error");
        const gotState = url.searchParams.get("state");
        const gotCode = url.searchParams.get("code");
        if (err) {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Login dibatalkan.");
          return finish(new Error(`Login dibatalkan: ${err}`));
        }
        if (gotState !== state || !gotCode) {
          res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Permintaan tidak valid.");
          return finish(new Error("Login gagal: state tidak cocok"));
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(SUCCESS_HTML);
        finish(null, gotCode);
      });
      server.on("close", () => finish(new Error("Login dibatalkan")));
      const auth = new URL(AUTH_URL);
      auth.search = new URLSearchParams({
        client_id: this.deps.clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        access_type: "offline",
        prompt: "consent",
      }).toString();
      this.deps.openExternal(auth.toString()).catch((e) => finish(e));
    });

    const tokens = await this.tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });
    if (!tokens.refresh_token) throw new Error("Google tidak mengirim refresh token");
    this.access = { token: tokens.access_token, expiresAt: this.deps.now() + tokens.expires_in * 1000 };
    const email = await this.fetchEmail(tokens.access_token);
    await this.deps.store.save({ refreshToken: tokens.refresh_token, email });
    return { email };
  }

  async signOut(): Promise<void> {
    const s = await this.deps.store.load();
    this.access = null;
    if (s) {
      await this.deps
        .fetch(`${REVOKE_URL}?token=${encodeURIComponent(s.refreshToken)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } })
        .catch(() => {});
    }
    await this.deps.store.clear();
  }

  async getAccessToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
    if (!opts.forceRefresh && this.access && this.access.expiresAt - EXPIRY_MARGIN_MS > this.deps.now()) return this.access.token;
    this.refreshing ??= this.refresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    const s = await this.deps.store.load();
    if (!s) throw new AuthRequiredError();
    try {
      const t = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: s.refreshToken });
      this.access = { token: t.access_token, expiresAt: this.deps.now() + t.expires_in * 1000 };
      return t.access_token;
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        this.access = null;
        await this.deps.store.clear();
      }
      throw err;
    }
  }

  private async tokenRequest(params: Record<string, string>): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
    let res: Response;
    try {
      res = await this.deps.fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: this.deps.clientId, client_secret: this.deps.clientSecret, ...params }).toString(),
      });
    } catch {
      throw new DriveNetworkError();
    }
    if (res.status >= 500 || res.status === 429) throw new DriveNetworkError(`Google token endpoint ${res.status}`);
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      if (body.error === "invalid_grant" || res.status === 401) throw new AuthRequiredError();
      throw new Error(`Login gagal: ${String(body.error_description ?? body.error ?? res.status)}`);
    }
    return body as { access_token: string; expires_in: number; refresh_token?: string };
  }

  private async fetchEmail(accessToken: string): Promise<string | null> {
    try {
      const r = await this.deps.fetch(USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } });
      return r.ok ? (((await r.json()) as { email?: string }).email ?? null) : null;
    } catch {
      return null;
    }
  }
}
