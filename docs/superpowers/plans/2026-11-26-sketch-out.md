# Sketch Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi desktop Electron berbasis editor Excalidraw resmi, dengan penyimpanan file lokal dan Google Drive yang tetap bisa dipakai offline lalu tersinkron otomatis saat online.

**Architecture:** Renderer (sandboxed React + `@excalidraw/excalidraw`) hanya berbicara ke proses main lewat API bertipe `window.sketchOut` dari preload. Proses main memegang semua I/O: file lokal, token OAuth, Google Drive REST, cache offline, dan SyncEngine. Sumber kebenaran untuk dokumen Drive selalu cache lokal; Drive diperbarui oleh SyncEngine.

**Tech Stack:** Electron, TypeScript (strict), electron-vite, React, @excalidraw/excalidraw, zod, Vitest, Playwright (`_electron`), electron-builder.

**Spec:** `docs/superpowers/specs/2026-11-26-sketch-out-design.md`

## Global Constraints

- Nama aplikasi: `Sketch Out`; appId `com.sketchout.app`; nama paket npm `sketch-out`; protokol kustom `sketchout://`.
- Pakai versi stabil terbaru semua paket saat dibangun; Node ≥ 20.
- `BrowserWindow.webPreferences`: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Preload hanya mengekspos `window.sketchOut`; tidak ada `ipcRenderer` mentah.
- Setiap handler IPC memvalidasi sender (frame milik app) dan input (zod).
- Token Google hanya di proses main, disimpan terenkripsi dengan `safeStorage`.
- Scope OAuth tepat: `https://www.googleapis.com/auth/drive.file`.
- OAuth: browser sistem + loopback `http://127.0.0.1:<port acak>` + PKCE (S256).
- Kredensial dari `.env` (tidak di-commit): `MAIN_VITE_GOOGLE_CLIENT_ID`, `MAIN_VITE_GOOGLE_CLIENT_SECRET`. Sediakan `.env.example`.
- Format file: `.excalidraw` standar (`{type:"excalidraw", version:2, source, elements, appState, files}`) — pakai `serializeAsJSON` / `loadFromBlob` dari paket Excalidraw.
- Folder Drive: `Sketch Out` di root My Drive; file mimeType `application/json`, `appProperties: { sketchOut: "1" }`.
- Debounce: autosave lokal 1000 ms; tulis cache Drive 500 ms; unggah Drive 2000 ms setelah perubahan terakhir.
- Backoff jaringan: 2 s, digandakan, maksimal 60 s.
- Nama salinan konflik: `<nama> (konflik YYYY-MM-DD HH.mm).excalidraw`.
- Semua penulisan file (lokal dan cache) atomik: tulis `<file>.tmp-<rand>` lalu `rename`.
- Copy UI berbahasa Indonesia untuk teks yang kita tambahkan; teks Excalidraw mengikuti `langCode` pengguna.
- Bukan sasaran: kolaborasi live, shareable link, AI, Excalidraw+, auto-update, code signing.

## Review Focus

1. **Offline sejak app dibuka** — font Excalidraw dimuat dari CDN secara default; tanpa internet teks tampil dengan font fallback. Harapan: font di-bundle dan `window.EXCALIDRAW_ASSET_PATH` menunjuk aset lokal. (Test di Task 1.)
2. **App ditutup/crash saat dokumen Drive `dirty`** — harapan: saat dibuka lagi, perubahan ada di cache dan otomatis diunggah. (Test di Task 9.)
3. **Gambar besar tertanam (beberapa MB)** — harapan: unggah tetap berhasil (pakai upload `multipart`/`media`, bukan query param) dan tidak memblok UI. (Test di Task 7.)
4. **Edit terus-menerus saat unggah sedang berjalan** — harapan: perubahan selama unggah tidak hilang; setelah unggah selesai dokumen tetap `pending` dan diunggah lagi. (Test di Task 9.)
5. **File lokal dihapus/dipindah dari luar saat terbuka** — harapan: autosave tidak crash; pengguna diberi tahu dan ditawari "Simpan sebagai". (Test di Task 3.)

---

## File Structure

```
sketch-out/
  package.json, tsconfig*.json, electron.vite.config.ts, electron-builder.yml
  .env.example, .gitignore, README.md
  resources/                 # ikon app
  src/shared/
    types.ts                 # SceneJSON, DocRef, SyncStatus, SyncState, DriveFileInfo, CacheMeta
    ipc.ts                   # nama channel + skema zod input
  src/main/
    index.ts                 # lifecycle app, single-instance, protokol, fuses-safe defaults
    windows.ts               # createDocumentWindow, registry DocRef→window
    security.ts              # webPreferences, CSP, navigation guards
    menu.ts                  # menu native
    ipc/register.ts          # handle(channel, schema, fn) + validasi sender
    ipc/handlers.ts          # semua handler, memanggil services
    services/atomicWrite.ts
    services/localFiles.ts   # read/write .excalidraw, mtime
    services/store.ts        # JSON store di userData (settings, recent, library)
    services/auth/pkce.ts
    services/auth/tokenStore.ts
    services/auth/authService.ts
    services/drive/errors.ts
    services/drive/driveClient.ts   # interface DriveClient + implementasi REST (fetch)
    services/cache/cacheStore.ts
    services/sync/syncEngine.ts
    services/connectivity.ts
  src/preload/index.ts, src/preload/api.ts  # tipe SketchOutApi
  src/renderer/
    index.html, main.tsx, App.tsx
    doc/useDocumentSession.ts   # state dokumen, debounce simpan, dispatch lokal/drive
    components/AppMainMenu.tsx, AppWelcomeScreen.tsx, SyncBadge.tsx,
               DriveDialog.tsx, ConflictNotice.tsx, ExternalChangePrompt.tsx
  tests/unit/**, tests/e2e/**
```

---

### Task 1: Kerangka Electron aman + editor Excalidraw tampil offline

**Files:**
- Create: semua file konfigurasi root, `src/main/index.ts`, `src/main/windows.ts`, `src/main/security.ts`, `src/preload/index.ts`, `src/renderer/{index.html,main.tsx,App.tsx}`
- Test: `tests/unit/security.test.ts`, `tests/e2e/launch.spec.ts`

**Interfaces:**
- Produces: `secureWebPreferences(preloadPath: string): Electron.WebPreferences`; `CSP: string`; `installNavigationGuards(contents: WebContents): void`; `createDocumentWindow(doc: DocRef | null): BrowserWindow` (versi awal: tanpa registry).

- [ ] **Step 1:** `git init`, buat proyek dengan template `electron-vite` React+TS, tambahkan `@excalidraw/excalidraw`, vitest, `@playwright/test`. `.gitignore` berisi `node_modules`, `out`, `dist`, `.env`.
- [ ] **Step 2: Tulis test gagal** `tests/unit/security.test.ts`:
  - `secureWebPreferences("/p")` sama dengan `{ preload: "/p", contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }` (boleh ada field tambahan `spellcheck`).
  - `CSP` memuat `default-src 'self'`, `script-src 'self'`, `font-src 'self' data:`, `img-src 'self' data: blob: https:`, `worker-src 'self' blob:`, `frame-src https:`, dan **tidak** memuat `unsafe-eval`.
- [ ] **Step 3:** Jalankan `npx vitest run tests/unit/security.test.ts` → FAIL (modul tidak ada).
- [ ] **Step 4: Implementasi** `security.ts`. `installNavigationGuards`: `will-navigate` ke origin selain app → `preventDefault`; `setWindowOpenHandler` → URL `https:` dibuka dengan `shell.openExternal`, selalu `{action:"deny"}`. CSP dipasang lewat `session.defaultSession.webRequest.onHeadersReceived` untuk build produksi dan `<meta http-equiv>` di `index.html`.
- [ ] **Step 5:** Render `<Excalidraw />` full-window di `App.tsx` (import CSS paket). Salin folder font dari `node_modules/@excalidraw/excalidraw/dist/prod/fonts` ke aset renderer saat build (plugin copy vite) dan set `window.EXCALIDRAW_ASSET_PATH = "./"` sebelum import Excalidraw.
- [ ] **Step 6: Tulis test e2e** `tests/e2e/launch.spec.ts` (`_electron.launch` pada build `out/`):
  - jendela pertama memuat `.excalidraw` (selector `.excalidraw-container`) dalam 10 s;
  - `page.evaluate(() => typeof (window as any).require)` === `"undefined"`;
  - dengan `context.route("**/*", r => new URL(r.request().url()).protocol.startsWith("http") ? r.abort() : r.continue())`, `document.fonts.check('16px Excalifont')` bernilai `true` setelah `document.fonts.ready`. (Review Focus 1)
- [ ] **Step 7:** `npm run build && npx playwright test tests/e2e/launch.spec.ts` → PASS; `npx vitest run` → PASS.
- [ ] **Step 8:** Commit `feat: secure electron shell with offline excalidraw editor`.

### Task 2: Jembatan IPC bertipe dan tervalidasi

**Files:**
- Create: `src/shared/types.ts`, `src/shared/ipc.ts`, `src/main/ipc/register.ts`, `src/preload/api.ts`; Modify: `src/preload/index.ts`
- Test: `tests/unit/ipc-register.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`):
  ```ts
  export type SceneJSON = string; // hasil serializeAsJSON
  export type DocRef =
    | { kind: "local"; path: string | null }
    | { kind: "drive"; localId: string; fileId: string | null };
  export type SyncStatus = "synced" | "pending" | "syncing" | "offline" | "error" | "conflict";
  export interface SyncState { localId: string; status: SyncStatus; lastSyncedAt: number | null; error: string | null;
    notice: { type: "conflict"; copyName: string; originalFileId: string } | null }
  export interface DriveFileInfo { id: string; name: string; modifiedTime: string; version: string }
  export interface CacheMeta { localId: string; fileId: string | null; name: string; baseVersion: string | null;
    dirty: boolean; lastSyncedAt: number | null; lastError: string | null }
  ```
- Produces: `handle<S extends z.ZodTypeAny, R>(channel: string, schema: S, fn: (input: z.infer<S>, e: IpcMainInvokeEvent) => Promise<R> | R): void`; `isTrustedSender(frame: WebFrameMain | null): boolean`.
- Produces: tipe `SketchOutApi` (diisi bertahap oleh task berikut) dengan namespace `files`, `drive`, `auth`, `sync`, `app`, plus `on(event, cb): () => void` untuk event main→renderer (`sync:state`, `menu:command`, `library:add`, `doc:open`).

- [ ] **Step 1: Tulis test gagal**:
  - `isTrustedSender` true untuk URL `file://…/out/renderer/index.html` dan URL dev server `process.env.ELECTRON_RENDERER_URL`; false untuk `https://evil.com` dan `null`.
  - handler yang didaftarkan dengan `z.object({ path: z.string() })` menolak input `{ path: 1 }` dengan error berisi `"Invalid input"` dan tidak memanggil `fn`.
  - sender tak dipercaya → reject `"Untrusted sender"`.
- [ ] **Step 2:** `npx vitest run tests/unit/ipc-register.test.ts` → FAIL.
- [ ] **Step 3:** Implementasi `register.ts` (mock `ipcMain` di test lewat injeksi). Preload: `contextBridge.exposeInMainWorld("sketchOut", api)` di mana setiap metode memanggil `ipcRenderer.invoke(channel, input)`; `on` hanya mengizinkan nama event dari daftar tetap.
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5:** Commit `feat: typed validated IPC bridge`.

### Task 3: Penulisan atomik + layanan file lokal

**Files:**
- Create: `src/main/services/atomicWrite.ts`, `src/main/services/localFiles.ts`, `src/main/services/store.ts`
- Test: `tests/unit/atomicWrite.test.ts`, `tests/unit/localFiles.test.ts`, `tests/unit/store.test.ts`

**Interfaces:**
- Produces: `atomicWriteFile(path: string, data: string): Promise<void>`
- Produces: `readLocalFile(path): Promise<{ json: SceneJSON; mtimeMs: number }>`; `writeLocalFile(path, json): Promise<{ mtimeMs: number }>`; `statMtime(path): Promise<number | null>` (null jika tidak ada); `class LocalFileMissingError`.
- Produces: `createJsonStore<T>(file: string, defaults: T): { get(): T; set(patch: Partial<T>): Promise<void> }`; instance `appStore` dengan `{ recent: string[] (maks 10, terbaru dulu), theme, langCode, driveFolderId: string | null, driveListCache: DriveFileInfo[] }` dan file terpisah `library.json`.

- [ ] **Step 1: Tulis test gagal**:
  - `atomicWriteFile` lalu baca → isi sama; tidak ada file `*.tmp-*` tersisa di direktori.
  - jika `rename` dipaksa gagal (spy), file lama tetap utuh dan tmp dibersihkan.
  - `readLocalFile` pada JSON tanpa `type:"excalidraw"` → throw `"Bukan file Excalidraw"`.
  - `writeLocalFile` ke path yang direktorinya sudah dihapus → throw `LocalFileMissingError` (Review Focus 5).
  - store: `recent` dedupe + dibatasi 10; file store korup → kembali ke `defaults` tanpa throw.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementasi. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: atomic local file IO and json store`.

### Task 4: Mode lokal end-to-end (buka, simpan, autosave, menu)

**Files:**
- Create: `src/main/menu.ts`, `src/main/ipc/handlers.ts` (bagian files/app), `src/renderer/doc/useDocumentSession.ts`, `src/renderer/components/{AppMainMenu,AppWelcomeScreen,SyncBadge,ExternalChangePrompt}.tsx`; Modify: `App.tsx`, `windows.ts`
- Test: `tests/unit/documentSession.test.ts`, `tests/e2e/local-file.spec.ts`

**Interfaces:**
- Consumes: Task 2 `handle`, Task 3 services.
- Produces (IPC `files.*`): `openDialog(): Promise<{path, json, mtimeMs} | null>`, `read(path)`, `write(path, json): Promise<{mtimeMs}>`, `saveAsDialog(json, suggestedName): Promise<{path, mtimeMs} | null>`, `statMtime(path)`, `recent(): Promise<string[]>`, `writeRecovery(windowId, json)`, `readRecovery(): Promise<{windowId, json}[]>`, `clearRecovery(windowId)`.
- Produces (IPC `app.*`): `setTitle(title: string, edited: boolean)` → `win.setTitle` + `setDocumentEdited`.
- Produces: `useDocumentSession(api): { doc: DocRef; initialData; onChange(elements, appState, files): void; saveStatus: "saved" | "saving" | "error"; error: string | null; open…/saveAs… }`. Penyimpanan didelegasikan ke `DocSink` `{ save(json): Promise<void> }` per jenis dokumen supaya Task 10 cukup menambah sink Drive.

- [ ] **Step 1: Tulis test gagal** `documentSession.test.ts` (fake timers, fake api):
  - 3× `onChange` dalam 500 ms → `files.write` dipanggil tepat 1× setelah 1000 ms sejak perubahan terakhir.
  - perubahan yang hanya mengubah `appState` volatil (selection, scroll, zoom) tidak memicu simpan — bandingkan `getSceneVersion(elements)` + hash `files`.
  - dokumen `path: null` → `writeRecovery` dipanggil, bukan `write`.
  - `write` throw `LocalFileMissingError` → `saveStatus === "error"` dan `error` berisi `"File tidak ditemukan"`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementasi hook + komponen:
  - `AppMainMenu` memakai `MainMenu` Excalidraw: item bawaan (`DefaultItems.*`: LoadScene diganti oleh item kita, Export, SaveAsImage, Help, ClearCanvas, ToggleTheme, ChangeCanvasBackground) + item kita "Baru", "Buka file lokal…", "Simpan sebagai…", submenu "File terbaru". Item Drive ditambahkan di Task 10.
  - `AppWelcomeScreen` memakai `WelcomeScreen` (Center + Hints) dengan item Buka lokal dan File terbaru.
  - `SyncBadge` via `renderTopRightUI`: dokumen lokal → "Tersimpan" / "Menyimpan…" / "Gagal menyimpan".
  - Menu native (`menu.ts`): File(Baru ⌘N, Jendela Baru ⌘⇧N, Buka ⌘O, Simpan ⌘S = flush autosave, Simpan sebagai ⌘⇧S, Tutup ⌘W), Edit (role standar), View, Window, Help; perintah dikirim sebagai event `menu:command`.
  - Saat jendela `focus`: `statMtime(path)` ≠ mtime terakhir → `ExternalChangePrompt` ("Muat ulang" / "Pertahankan versi di app"); null → prompt "File dipindah atau dihapus" dengan tombol "Simpan sebagai…".
  - Saat start: `readRecovery()` → tawarkan pemulihan dokumen tanpa nama.
- [ ] **Step 4:** Unit test → PASS.
- [ ] **Step 5: Tulis test e2e** `local-file.spec.ts`: stub `dialog.showSaveDialog/showOpenDialog` lewat `electronApp.evaluate` ke path di tmpdir; gambar persegi (tekan `r`, drag di kanvas), Simpan sebagai, tunggu 1.5 s, baca file dari disk → `elements.length === 1` dan `type === "rectangle"`; tutup & luncurkan ulang, buka file → persegi tampil (`excalidrawAPI` diekspos ke `window.__api` hanya bila `process.env.E2E`).
- [ ] **Step 6:** `npm run build && npx playwright test` → PASS.
- [ ] **Step 7:** Commit `feat: local file mode with autosave and menus`.

### Task 5: Preferensi, library, dan "Browse libraries"

**Files:**
- Modify: `src/main/index.ts`, `handlers.ts`, `App.tsx`
- Test: `tests/unit/libraryUrl.test.ts`

**Interfaces:**
- Produces (IPC `app.*`): `getPrefs(): {theme, langCode}`, `setPrefs(p)`, `loadLibrary(): Promise<LibraryItems>`, `saveLibrary(items)`.
- Produces: `parseAddLibraryUrl(url: string): string | null` — menerima `sketchout://addLibrary#addLibrary=<encoded>&token=…`, mengembalikan URL library **hanya** jika host `libraries.excalidraw.com`, protokol `https:`.

- [ ] **Step 1: Tulis test gagal**: URL valid → URL library terdekode; host lain, `http:`, atau tanpa `addLibrary` → `null`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementasi: daftarkan protokol `sketchout` (`app.setAsDefaultProtocolClient`), tangani `open-url` (macOS) dan `second-instance` argv; main `fetch` URL library, kirim blob/JSON ke renderer lewat event `library:add`; renderer `excalidrawAPI.updateLibrary({ libraryItems, merge: true, openLibraryMenu: true })`. Props `<Excalidraw libraryReturnUrl="sketchout://addLibrary" onLibraryChange={saveLibrary} langCode theme>`; tema & bahasa tersimpan via `onChange` appState (debounce).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: persist prefs and library, support library browser return`.

### Task 6: AuthService (OAuth desktop PKCE + token terenkripsi)

**Files:**
- Create: `src/main/services/auth/{pkce,tokenStore,authService}.ts`
- Test: `tests/unit/pkce.test.ts`, `tests/unit/tokenStore.test.ts`, `tests/unit/authService.test.ts`

**Interfaces:**
- Produces: `createPkcePair(): { verifier: string; challenge: string }` (verifier 64 char base64url); `challengeFor(verifier: string): string` = base64url(SHA256(verifier)).
- Produces: `createTokenStore(file, crypto: { encrypt(s): Buffer; decrypt(b): string; available(): boolean })` → `{ load(): Promise<string|null>; save(refreshToken): Promise<void>; clear(): Promise<void> }`.
- Produces: `class AuthService { signIn(): Promise<{ email: string }>; signOut(): Promise<void>; getAccessToken(): Promise<string>; status(): Promise<{ signedIn: boolean; email: string | null }> }`; `getAccessToken` cache token sampai 60 s sebelum kedaluwarsa; `class AuthRequiredError`.
- Produces (IPC `auth.*`): `signIn`, `signOut`, `status`.

- [ ] **Step 1: Tulis test gagal**:
  - PKCE: verifier cocok `/^[A-Za-z0-9_-]{43,128}$/`; fungsi challenge memenuhi vektor RFC 7636: verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` → challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` (ekspor `challengeFor(verifier)` agar bisa dites).
  - tokenStore: `save` lalu `load` mengembalikan token; isi file di disk ≠ token plaintext; `available() === false` → `save` throw `"Penyimpanan aman tidak tersedia"`.
  - authService (fetch & `shell.openExternal` di-mock): URL otorisasi berisi `code_challenge_method=S256`, `scope=…drive.file`, `redirect_uri=http://127.0.0.1:<port>`, `access_type=offline`, `prompt=consent`; parameter `state` yang salah di callback → reject; respons token 400 `invalid_grant` di `getAccessToken` → `clear()` dipanggil dan throw `AuthRequiredError`; `signOut` memanggil `https://oauth2.googleapis.com/revoke`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementasi: server `http` sekali pakai di `127.0.0.1:0`, timeout 5 menit, halaman balasan "Login berhasil, kembali ke Sketch Out". Email diambil dari `https://www.googleapis.com/oauth2/v3/userinfo` (tambahkan scope `openid email`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: google oauth desktop flow with encrypted token store`.

### Task 7: DriveClient (REST via fetch)

**Files:**
- Create: `src/main/services/drive/{errors,driveClient}.ts`
- Test: `tests/unit/driveClient.test.ts`

**Interfaces:**
- Consumes: `AuthService.getAccessToken()`.
- Produces:
  ```ts
  export interface DriveClient {
    ensureAppFolder(): Promise<string>;           // cari folder "Sketch Out" (appProperties.sketchOut="1"), buat jika tidak ada
    list(folderId: string): Promise<DriveFileInfo[]>; // trashed=false, urut modifiedTime desc
    getMeta(fileId: string): Promise<DriveFileInfo>;
    download(fileId: string): Promise<string>;
    create(folderId: string, name: string, json: string): Promise<DriveFileInfo>;
    update(fileId: string, json: string): Promise<DriveFileInfo>;
    rename(fileId: string, name: string): Promise<DriveFileInfo>;
    trash(fileId: string): Promise<void>;
  }
  export class DriveNetworkError extends Error {}   // fetch TypeError, timeout 30 s, 5xx, 429
  export class DriveNotFoundError extends Error {}  // 404
  // 401 setelah satu kali refresh token → AuthRequiredError (dari Task 6)
  ```
  Semua respons file meminta `fields=id,name,modifiedTime,version`.

- [ ] **Step 1: Tulis test gagal** (fetch di-mock):
  - `create` mengirim `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=…` dengan bagian metadata `{name, mimeType:"application/json", parents:[folderId], appProperties:{sketchOut:"1"}}` dan bagian isi JSON.
  - `update` dengan isi 8 MB memakai `PATCH …/upload/drive/v3/files/<id>?uploadType=media` dan body utuh (Review Focus 3).
  - fetch melempar `TypeError` → `DriveNetworkError`; 503 → `DriveNetworkError`; 404 → `DriveNotFoundError`; 401 lalu 401 lagi setelah refresh → `AuthRequiredError`.
  - `ensureAppFolder` tidak membuat folder baru bila query `mimeType='application/vnd.google-apps.folder' and appProperties has { key='sketchOut' and value='1' } and trashed=false` mengembalikan hasil.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementasi. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: drive rest client`.

### Task 8: CacheStore

**Files:**
- Create: `src/main/services/cache/cacheStore.ts`
- Test: `tests/unit/cacheStore.test.ts`

**Interfaces:**
- Consumes: `atomicWriteFile`.
- Produces: `class CacheStore(rootDir)` dengan:
  `create(init: { fileId: string | null; name: string; json: string; baseVersion: string | null; dirty: boolean }): Promise<CacheMeta>` (localId = `crypto.randomUUID()`),
  `writeDoc(localId, json): Promise<number>` (set `dirty: true`, kembalikan nomor revisi lokal yang naik),
  `readDoc(localId): Promise<string>`, `getMeta(localId)`, `updateMeta(localId, patch)`, `findByFileId(fileId): Promise<CacheMeta | null>`, `listDirty(): Promise<CacheMeta[]>`, `revision(localId): number`.

- [ ] **Step 1: Tulis test gagal**: `writeDoc` menandai `dirty`; `findByFileId` menemukan entri setelah restart (instance baru di root yang sama); `listDirty` hanya mengembalikan yang `dirty`; `meta.json` korup → entri dilewati dengan log, tidak throw; revisi naik monoton per `writeDoc`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementasi (layout `drive-cache/<localId>/{doc.excalidraw,meta.json}` sesuai spec). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: offline drive cache store`.

### Task 9: SyncEngine

**Files:**
- Create: `src/main/services/sync/syncEngine.ts`, `src/main/services/connectivity.ts`
- Test: `tests/unit/syncEngine.test.ts`, `tests/unit/fakeDrive.ts`

**Interfaces:**
- Consumes: `DriveClient`, `CacheStore`, error classes Task 6–7.
- Produces:
  ```ts
  class SyncEngine extends EventEmitter { // emit("state", SyncState)
    constructor(deps: { drive: DriveClient; cache: CacheStore; getFolderId(): Promise<string>;
                        now(): number; isOnline(): boolean });
    openDriveFile(fileId: string): Promise<{ meta: CacheMeta; json: string }>;
    createDriveDoc(name: string, json: string): Promise<CacheMeta>;   // fileId null sampai terunggah
    saveLocal(localId: string, json: string): Promise<void>;          // writeDoc + jadwal unggah 2000 ms
    syncNow(localId: string): Promise<SyncState>;
    syncAllDirty(): Promise<void>;
    setOnline(online: boolean): void;                                  // true → syncAllDirty
    getState(localId: string): SyncState;
    dismissNotice(localId: string): void;
  }
  ```
  `connectivity.ts`: `watchConnectivity(onChange: (online: boolean) => void): () => void` — gabungan `net.isOnline()` polling 15 s dan laporan dari renderer (`online`/`offline`).

**Aturan (dari spec):**
- `syncNow`: offline → status `offline`. `fileId === null` → `create`. Selain itu `getMeta`; `version === baseVersion` → `update`; berbeda → konflik.
- Konflik: `create(folder, "<nama> (konflik YYYY-MM-DD HH.mm)", jsonLokal)`; meta lokal dipindah ke file salinan (`fileId`, `name`, `baseVersion` baru); status `synced` dengan `notice = { type:"conflict", copyName, originalFileId }`. Versi Drive asli tidak disentuh.
- Edit selama unggah: catat `revision` sebelum unggah; setelah sukses, hanya set `dirty:false` bila revisi tidak berubah, jika berubah tetap `pending` dan jadwalkan lagi.
- `DriveNetworkError` → `offline`, retry backoff 2 s → 4 s → … maks 60 s; reset setelah sukses. `AuthRequiredError` → `error` dengan `error: "Perlu login ulang"`, tanpa retry otomatis. `DriveNotFoundError` saat update → perlakukan sebagai `fileId = null` (buat ulang) dan beri `notice` konflik dengan `copyName` nama baru.
- `openDriveFile`: online → aturan pembukaan di spec §5.5; offline → cache jika ada, jika tidak throw `"File belum tersedia offline"`.

- [ ] **Step 1: Tulis `fakeDrive.ts`** (DriveClient in-memory dengan `version` naik per tulis, saklar `offline`, `failNext(err)`) **dan test gagal**:
  - `offline lalu online`: saveLocal saat offline → status `offline`, fake tidak menerima tulisan; `setOnline(true)` → status `synced`, isi Drive = json lokal.
  - `unggah gagal di tengah`: `failNext(DriveNetworkError)` → `offline`, retry setelah 2000 ms (fake timers) → `synced`; kegagalan berturut-turut menjadwalkan 2000, 4000, 8000 … ≤ 60000.
  - `konflik version`: Drive diubah di luar (version naik) lalu saveLocal → Drive punya file baru bernama `"Diagram (konflik 2026-11-26 14.05)"` (dengan `now` tetap), file asli tidak berubah, `notice.type === "conflict"`.
  - `dokumen baru dibuat offline`: `createDriveDoc` offline → `fileId === null`; online → file dibuat sekali (bukan dua kali walau `syncNow` dipanggil paralel).
  - `restart saat dirty` (Review Focus 2): engine A saveLocal offline; engine B baru dengan cache yang sama, `syncAllDirty()` → Drive berisi json.
  - `edit selama unggah` (Review Focus 4): fake `update` ditahan (promise manual), saveLocal lagi, lepaskan → status `pending`, unggahan kedua terjadi berisi json terbaru.
  - `token kedaluwarsa`: `failNext(AuthRequiredError)` → status `error`, `error === "Perlu login ulang"`, cache tetap `dirty`.
  - `open`: Drive lebih baru & cache bersih → mengunduh; Drive lebih baru & cache dirty → alur konflik; offline tanpa cache → throw `"File belum tersedia offline"`.
- [ ] **Step 2:** `npx vitest run tests/unit/syncEngine.test.ts` → FAIL.
- [ ] **Step 3:** Implementasi; satu antrean promise per `localId` untuk mencegah unggahan paralel.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: offline-first drive sync engine`.

### Task 10: Mode Drive di UI

**Files:**
- Create: `src/renderer/components/{DriveDialog,ConflictNotice}.tsx`; Modify: `handlers.ts`, `windows.ts`, `useDocumentSession.ts`, `AppMainMenu.tsx`, `AppWelcomeScreen.tsx`, `SyncBadge.tsx`, `src/main/index.ts`
- Test: `tests/unit/windowRegistry.test.ts`, `tests/unit/documentSession.drive.test.ts`

**Interfaces:**
- Consumes: Task 6 `AuthService`, Task 7 `DriveClient`, Task 9 `SyncEngine`, Task 4 `DocSink`.
- Produces (IPC `drive.*`): `list(): Promise<{ files: DriveFileInfo[]; offline: boolean }>` (offline → `appStore.driveListCache`), `open(fileId): Promise<{ localId; name; json }>`, `create(name, json)`, `rename(fileId, name)`, `trash(fileId)`; (`sync.*`): `save(localId, json)`, `syncNow(localId)`, `getState(localId)`, `dismissNotice(localId)`, `reportOnline(online)`; event `sync:state`.
- Produces (`windows.ts`): `findWindowFor(doc: DocRef): BrowserWindow | null` — kunci `local:<path>` / `drive:<fileId ?? localId>`; `openDocument(doc)` memfokuskan jendela yang ada atau membuat jendela baru.

- [ ] **Step 1: Tulis test gagal**:
  - registry: `openDocument({kind:"drive", fileId:"f1", localId:"a"})` dua kali → satu jendela, panggilan kedua `focus()`; menutup jendela menghapus kuncinya.
  - session drive: `onChange` → `sync.save` dipanggil 1× setelah 500 ms; status badge mengikuti event `sync:state`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementasi:
  - Menu utama: "Buka dari Google Drive…", "Simpan ke Google Drive…" (salin dokumen saat ini sebagai dokumen Drive baru), "Akun Google" (Masuk / Keluar — keluar memperingatkan bila ada `listDirty()`).
  - `DriveDialog` memakai `Dialog` styling Excalidraw (`.Dialog`, kelas `Island`): daftar nama + waktu diubah, tombol Baru / Ganti nama / Pindahkan ke sampah, banner "Offline — menampilkan daftar terakhir".
  - `SyncBadge` dokumen Drive: `synced` "Tersimpan ke Drive" · `pending`/`syncing` "Menyinkron…" · `offline` "Offline — tersimpan di perangkat" · `error` pesan + tombol "Login ulang" · klik → `syncNow`.
  - `ConflictNotice`: toast dengan teks "File di Drive diubah di tempat lain. Perubahanmu disimpan sebagai "<copyName>"." dan tombol "Buka versi Drive" (→ `openDocument` fileId asli) / "Tutup" (→ `dismissNotice`).
  - Main: `before-quit` → `syncAllDirty()` dengan batas 5 s lalu keluar; saat start (setelah login terdeteksi) → `syncAllDirty()`; `watchConnectivity` → `setOnline`.
- [ ] **Step 4:** Run → PASS; `npm run build` lulus tanpa error tipe.
- [ ] **Step 5: Uji manual** (butuh `.env`): login, buat dokumen Drive, matikan Wi-Fi, gambar, badge "Offline", nyalakan Wi-Fi, badge "Tersimpan ke Drive" dan isi file di drive.google.com sesuai; ubah file dari perangkat lain/upload ulang lalu edit → salinan konflik muncul.
- [ ] **Step 6:** Commit `feat: google drive mode with sync status and conflict notice`.

### Task 11: Multi-jendela, asosiasi file, packaging, README

**Files:**
- Modify: `src/main/index.ts`, `electron-builder.yml`, `package.json`; Create: `README.md`, `.env.example`, `resources/icon.icns`
- Test: `tests/e2e/open-file.spec.ts`

**Interfaces:**
- Consumes: `openDocument` (Task 10).

- [ ] **Step 1: Tulis test e2e gagal**: meluncurkan app dengan argumen path `.excalidraw` (fixture) → jendela memuat elemen dari fixture; meluncurkan instance kedua dengan path lain → tetap satu proses, jendela kedua terbuka (`electronApp.windows().length === 2`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementasi `app.requestSingleInstanceLock()`, `second-instance` & `open-file` → `openDocument`; `electron-builder.yml`: `appId: com.sketchout.app`, `productName: Sketch Out`, target `dmg` (arm64 + x64), `fileAssociations: [{ ext: excalidraw, name: Excalidraw Drawing, role: Editor }]`, `protocols: [{ name: Sketch Out, schemes: [sketchout] }]`, `electronFuses: { runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true }`, `asar: true`.
- [ ] **Step 4:** Run → PASS. `npm run dist` menghasilkan `dist/Sketch Out-<ver>-arm64.dmg`.
- [ ] **Step 5:** README: cara install/run/test, dan langkah Google Cloud Console — buat project, aktifkan Google Drive API, OAuth consent screen (External, mode Testing, tambahkan email sendiri sebagai test user, scope `drive.file`, `openid`, `email`), buat OAuth Client ID tipe **Desktop app**, isi `.env`. Catatan: dmg belum ditandatangani → buka pertama kali lewat klik kanan › Open.
- [ ] **Step 6:** Commit `feat: multi-window, file association, mac packaging, docs`.
