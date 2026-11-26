# Mode Folder, Logo Pensil & Installer Kecil — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buka folder lokal berisi catatan `.excalidraw`, lalu pindah antar catatan lewat sidebar + tab dalam satu jendela. Ganti logo jadi pensil. Kecilkan installer (hanya arm64).

**Architecture:**
- Jendela folder adalah `BrowserWindow` biasa dengan `InitialDoc.folder` terisi.
- Renderer merender `FolderWorkspace`: sidebar, tab bar, dan satu `DocView` (yang sudah ada) untuk tab aktif. `DocView` di-flush dulu sebelum pindah tab.
- Proses utama memegang layanan folder (list/create/rename/trash/watch) dan grant folder.

**Tech Stack:** Electron 45, electron-vite, React 19, Excalidraw 0.18.1, zod 4, Vitest, Playwright `_electron`, electron-builder 26.

**Spec:** `docs/superpowers/specs/2026-11-26-folder-mode-design.md`

## Global Constraints
- Folder hanya lokal. Pemindaian rekursif; hanya subfolder yang berisi `.excalidraw` (di kedalaman berapa pun) yang tampil. Lewati folder diawali `.` dan `node_modules`; kedalaman ≤ 8; maksimum 5.000 file.
- Semua teks UI dalam bahasa Indonesia.
- Setiap IPC baru terdaftar di `CHANNELS`, divalidasi zod, dan memakai `assertGranted`.
- Membuka file tunggal (Finder / Buka… / argumen) tetap berperilaku seperti sekarang.
- Target mac hanya `arm64`. `electronLanguages: [en, id]`. Installer ≤ 100 MB.
- Pindah tab tidak boleh kehilangan perubahan: flush dulu. Kalau masih ada perubahan yang belum tersimpan setelah flush, jangan pindah.

## Review Focus
1. **Pindah tab saat save gagal** (file dihapus di Finder): tab tidak berpindah, dan muncul toast "Gagal menyimpan".
2. **Path di luar folder** (`../x.excalidraw`, symlink ke luar, ekstensi lain) ditolak oleh `assertGranted`.
3. **Nama catatan ganda/kosong/berisi `/`**: create/rename memberi akhiran " 2" atau menolak dengan pesan jelas.
4. **Tab terakhir ditutup lalu jendela ditutup**: tidak ada prompt atau timeout 5 detik, karena state jendela direset.
5. **File di tab aktif dihapus atau diganti nama dari Finder**: sidebar diperbarui. Tab file yang hilang memakai overlay "File dipindah atau dihapus" yang sudah ada.

---

### Task 1: Installer kecil + logo pensil

**Files:**
- Modify: `package.json` (pindahkan `@excalidraw/excalidraw`, `react`, `react-dom`, `zod` ke `devDependencies`)
- Modify: `electron-builder.yml` (`arch: [arm64]`, `electronLanguages: [en, id]`)
- Modify: `electron.vite.config.ts` (`externalizeDepsPlugin` tanpa `exclude`, karena dependencies sekarang kosong)
- Modify: `resources/icon.svg`, `resources/icon.png` (dari `resources/icon-pencil-draft.*`; hapus draft-nya)

- [ ] Pindahkan deps, lalu `npm install`.
  Run: `npm run typecheck && npm test`
  Expected: hijau (98 tests).
- [ ] Ganti icon: salin svg draft, lalu render png 1024 dengan `qlmanage -t -s 1024`.
- [ ] `npm run dist`, lalu cek ukuran.
  Run: `ls -la dist/*.dmg`
  Expected: hanya `arm64.dmg`, ≤ 100 MB. `app.asar` tidak berisi `node_modules`.
- [ ] Smoke test: jalankan app terpaket ±5 detik.
  Expected: tidak crash.
- [ ] Commit `build: smaller arm64-only installer and pencil icon`.

### Task 2: Layanan folder + grant folder

**Files:**
- Create: `src/main/services/folders.ts`
- Modify: `src/main/services/grants.ts`
- Test: `tests/unit/folders.test.ts`, `tests/unit/grants.test.ts`

**Interfaces — Produces:**
- `interface NoteInfo { name: string; path: string; rel: string; mtimeMs: number }` (di `src/shared/types.ts`; `name` tanpa ekstensi; `rel` = path relatif terhadap folder, pemisah `/`)
- `listNotes(dir: string): Promise<NoteInfo[]>`: rekursif; hanya file `.excalidraw` (bukan dotfile); lewati direktori diawali `.` dan `node_modules`; kedalaman ≤ 8; berhenti di 5.000 file; diurutkan menurut `rel` dengan `localeCompare(…, "id", { numeric: true })`. Pohon dibangun di renderer dari `rel`, jadi folder tanpa catatan otomatis tidak tampil.
- `validNoteName(name: string): string`: trim. Melempar `Error("Nama tidak valid")` bila kosong, berisi `/` atau `\`, atau diawali `.`.
- `uniqueNotePath(dir: string, name: string, except?: string): Promise<string>`: `name.excalidraw`, `name 2.excalidraw`, … (`except` = path yang boleh dipakai ulang, untuk rename ke nama sendiri).
- `createNote(dir: string, name: string, json: string): Promise<string>`: `dir` boleh folder ber-grant atau subfoldernya; menulis atomik dan mengembalikan path.
- `renameNote(path: string, name: string): Promise<string>`
- `watchFolder(dir: string, onChange: () => void, debounceMs = 300): () => void` — `fs.watch(dir, { recursive: true })`
- `grantFolder(dir: string): string`
- `assertGranted(p)` juga menerima `p` bila: `extname === ".excalidraw"`, `resolve(p)` berada di dalam folder ber-grant (di subfolder mana pun), dan (bila file ada) `realpath(p)` juga berada di dalam `realpath(folder)`.
- `assertGrantedDir(d: string): string`: `d` adalah folder ber-grant atau subfoldernya (untuk `folder:create`).

Test (tmp dir nyata):
- [ ] `listNotes` menyertakan `sub/c.excalidraw` (rel `sub/c.excalidraw`) dan `a/b/d.excalidraw`; mengabaikan `a.txt`, `.hidden.excalidraw`, `.git/x.excalidraw`, `node_modules/y.excalidraw`, dan file di kedalaman 9; mengurutkan `catatan 2` sebelum `catatan 10`.
- [ ] `createNote` dua kali dengan nama "Ide" menghasilkan `Ide.excalidraw` lalu `Ide 2.excalidraw`.
- [ ] `validNoteName("a/b")`, `""`, dan `".x"` melempar error.
- [ ] `renameNote(p, sameName)` mengembalikan `p` (tanpa akhiran " 2"). Rename ke nama yang sudah dipakai memberi akhiran " 2".
- [ ] `watchFolder` memanggil callback satu kali untuk tiga file yang dibuat beruntun (debounce).
- [ ] Grant: setelah `grantFolder(d)`, path berikut diizinkan/ditolak:

  | Path | Hasil |
  |---|---|
  | `d/x.excalidraw` | diizinkan |
  | `d/sub/x.excalidraw` | diizinkan |
  | `d/x.txt` | ditolak |
  | `d/../x.excalidraw` | ditolak |
  | `d-lain/x.excalidraw` (prefix, bukan subfolder) | ditolak |
  | symlink `d/l.excalidraw` → file di luar `d` | ditolak |

- [ ] Run: `npx vitest run tests/unit/folders.test.ts tests/unit/grants.test.ts`
  Expected: FAIL dulu, lalu PASS setelah implementasi.
- [ ] Commit `feat(main): folder service and folder grants`.

### Task 3: Wiring proses utama (store, IPC, jendela, menu, argumen)

**Files:**
- Modify: `src/main/services/appStores.ts`
  - `recentFolders: string[]`
  - `folderTabs: Record<string, { open: string[]; active: string | null }>`, berisi nama file (bukan path).
- Create: `src/main/ipc/folderHandlers.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/api.ts`
- Modify: `src/main/windows.ts`
  - `createDocumentWindow(doc, { folder })`, dengan `InitialDoc.folder: string | null`.
  - `openFolderWindow(dir)`: satu jendela per folder (Map `folderWindows`), memulai `watchFolder` yang mengirim `folder:changed`, dan menghentikannya pada `closed`.
  - `openFolderFromDialog(win?)`
- Modify: `src/main/menu.ts`
  - "Buka folder…" `CmdOrCtrl+Shift+O`.
  - "Tutup" `CmdOrCtrl+W`: jendela folder menerima command `closeTab`, jendela lain `win.close()`.
  - "Tab berikutnya" `Ctrl+Tab` / "Tab sebelumnya" `Ctrl+Shift+Tab` mengirim `nextTab` / `prevTab`.
- Modify: `src/main/index.ts`: argumen atau `open-file` berupa direktori membuka `openFolderWindow`. Grant `recentFolders` saat start.
- Modify: `MenuCommand` dengan tambahan `"closeTab" | "nextTab" | "prevTab" | "openFolder"`.

**Channels:**

| Channel | Input | Output |
|---|---|---|
| `folder:openDialog` | — | `void` (membuka jendela) |
| `folder:open` | `{dir}` | harus ber-grant |
| `folder:recent` | — | `string[]` |
| `folder:list` | `{dir}` | `NoteInfo[]` |
| `folder:create` | `{dir, name}` (`dir` = folder atau subfolder ber-grant) | `{path}` |
| `folder:rename` | `{path, name}` | `{path}` |
| `folder:trash` | `{path}` | `shell.trashItem` |
| `folder:getTabs` | `{dir}` | — |
| `folder:setTabs` | `{dir, open, active}` | — |

Event `folder:changed` membawa `{dir}`. Nama file dibatasi `z.string().max(200)`.

- [ ] Run: `npm run typecheck && npm test`
  Expected: hijau.
- [ ] Commit `feat(main): folder windows, IPC and menu`.

### Task 4: Reducer tab

**Files:**
- Create: `src/renderer/folder/tabs.ts`
- Test: `tests/unit/tabs.test.ts`

**Produces:**
- `interface TabsState { open: string[]; active: string | null }`, berisi path.
- `type TabsAction = {type:"open"|"close"|"activate", path} | {type:"next"|"prev"} | {type:"rename", from, to} | {type:"sync", existing: string[]}`
- `tabsReducer(s, a): TabsState`

Test:
- [ ] `open` menambah di akhir dan mengaktifkan. Membuka path yang sudah ada hanya mengaktifkan.
- [ ] `close` tab aktif mengaktifkan tetangga kanan, atau kiri kalau tab itu terakhir. Menutup satu-satunya tab menghasilkan `active: null`.
- [ ] `next`/`prev` berputar.
- [ ] `rename` mengganti path di `open` dan `active`.
- [ ] `sync` membuang path yang tidak ada di `existing`, kecuali tab aktif (yang tetap dipertahankan supaya overlay "missing" muncul).
- [ ] `buildTree(notes: NoteInfo[]): TreeNode[]` (`TreeNode = {type:"dir", name, rel, children} | {type:"note", note}`): folder dulu lalu catatan, urut nama; hanya folder yang berisi catatan.
- [ ] `tabLabels(notes: NoteInfo[], open: string[]): Record<string, string>`: nama file; bila bentrok, `nama — subfolder`.
- [ ] Run: `npx vitest run tests/unit/tabs.test.ts`
  Expected: FAIL, lalu PASS.
- [ ] Commit `feat(renderer): tab state reducer`.

### Task 5: UI FolderWorkspace

**Files:**
- Create: `src/renderer/folder/FolderWorkspace.tsx`, `Sidebar.tsx`, `TabBar.tsx`
- Modify: `src/renderer/App.tsx` (`init.folder`, lalu `<FolderWorkspace folder env />`)
- Modify: `src/renderer/Editor.tsx`
  - Ekspor `DocView`, dengan props opsional:
    - `handle?: MutableRefObject<{ flush(): Promise<boolean> } | null>` (`true` = tidak ada perubahan tersisa)
    - `onStatus?(s: SaveStatus)`
    - `onPath?(p: string)`
    - `titleSuffix?: string`
  - Ekspor `Account`.
- Modify: `src/renderer/components/AppMainMenu.tsx`, `AppWelcomeScreen.tsx` (item "Buka folder…" dengan `actions.openFolder`; grup "Folder terbaru" di menu utama)
- Modify: `src/renderer/styles.css` (sidebar 220px, bisa disembunyikan; tab bar; tema terang/gelap mengikuti `prefs.theme`)

**Perilaku:**
- Mount:
  - `folder:list` dan `folder:getTabs` (nama → path), lalu `sync`.
  - Kalau tidak ada tab, buka catatan pertama.
- Berlangganan `folder:changed`, lalu `list` ulang dan `sync`.
- Pindah tab:
  - `await handle.current.flush()`. Kalau `false`, tampilkan toast "Gagal menyimpan — tab tidak dipindah" dan batal.
  - Kalau berhasil, `files.read` path baru lalu render `DocView` dengan `key=path+gen`.
- `onReplace` dari `DocView` (muat ulang): `gen++` dengan doc baru.
- Perubahan `open`/`active` → `folder:setTabs` (nama file).
- Tidak ada tab aktif: panggil `app.setDocState({title: "<folder> — Sketch Out", edited:false, untitled:false, nonEmpty:false, recoveryId:null})`, dan tampilkan "Pilih catatan di sidebar".
- Command `closeTab`/`nextTab`/`prevTab` ditangani `FolderWorkspace`.
- "+ Catatan baru" (atau klik kanan subfolder › "Catatan baru di sini"): `NameDialog`, lalu `folder:create` dengan json kosong (`serialize([], {}, {})`), lalu buka sebagai tab.
- Klik kanan baris sidebar:
  - Ganti nama: `NameDialog`, lalu `folder:rename` dan `rename`. Kalau tab itu aktif, flush dulu lalu remount.
  - Pindahkan ke Tempat Sampah: `Modal` konfirmasi, lalu `folder:trash` dan `close`.
- Titik ● pada tab/baris untuk tab aktif bila status `pending`/`saving`/`error`.

- [ ] Run: `npm run typecheck && npm test`
  Expected: hijau.
- [ ] Jalankan `npm run dev`, buka folder, lalu screenshot (terang & gelap).
- [ ] Commit `feat(renderer): folder workspace with sidebar and tabs`.

### Task 6: E2E + build final

**Files:**
- Create: `tests/e2e/folder.spec.ts`, `tests/fixtures/folder/` (salinan `one-diamond`, `two-shapes`, `riset/one-diamond.excalidraw`, `kosong/catatan.txt`)
- Modify: `tests/e2e/helpers.ts` (`launch` menunggu `.excalidraw-container`, sama seperti sekarang)

**Test** (folder disalin ke tmp dan diberikan sebagai argumen):
- [ ] Sidebar menampilkan 2 catatan di akar dan folder `riset` (berisi 1 catatan); folder `kosong` tidak tampil. Tab pertama aktif dengan scene `["diamond"]`.
- [ ] Gambar persegi di tab A, klik B, lalu kembali ke A:
  - file A berisi `rectangle`;
  - file B tidak berubah (byte sama);
  - scene A berisi `diamond, rectangle`.
- [ ] "+ Catatan baru" dengan nama "Ide" membuat `Ide.excalidraw` di folder dan membukanya sebagai tab aktif.
- [ ] Run: `npm run build && npm run test:e2e`
  Expected: semua lulus (8 lama + baru).
- [ ] `npm run dist`, lalu smoke test app terpaket dengan argumen folder.
- [ ] Commit `test(e2e): folder mode`. Perbarui README (bagian Mode folder, ukuran installer).
