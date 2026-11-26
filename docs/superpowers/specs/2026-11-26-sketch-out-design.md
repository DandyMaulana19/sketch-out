# Sketch Out — Design

Tanggal: 2026-11-26 · Status: disetujui

> Nama aplikasi: **Sketch Out** (dipilih pemilik). Nama "Excalidraw" tidak dipakai sebagai nama aplikasi karena itu merek proyek Excalidraw.

## 1. Tujuan dan alasan

Aplikasi whiteboard desktop yang fitur dan tampilannya sama dengan Excalidraw, dengan dua mode penyimpanan:

- **Lokal**: file `.excalidraw` disimpan di disk. Tidak ada konsep online/offline.
- **Google Drive**: file disimpan di Drive. Saat koneksi putus, pekerjaan tetap bisa dilanjutkan dan tersimpan aman di perangkat. Saat online lagi, perubahan otomatis diunggah ke Drive.

Fase ini untuk satu pengguna (pemilik aplikasi). Kerja tim (yang nanti wajib online) adalah fase berikutnya, jadi desain sekarang tidak boleh menutup jalan ke sana.

## 2. Sasaran, bukan sasaran, anti-sasaran

**Sasaran**
- Editor identik dengan Excalidraw: semua alat gambar, teks, panah, library, ekspor PNG/SVG/clipboard, mode gelap, zen/grid/view mode, shortcut keyboard, undo/redo, gambar tertanam, bahasa (termasuk Bahasa Indonesia).
- Buka/simpan/simpan sebagai file lokal `.excalidraw`, plus daftar file terbaru.
- Login Google, lalu buat, buka, ganti nama, dan hapus (ke trash) file di folder aplikasi di Drive.
- Bekerja offline penuh untuk file Drive, dengan sinkronisasi otomatis saat online kembali.
- Indikator status sinkron yang jelas di UI.
- Installer macOS (`.dmg`). Kode dibuat lintas platform supaya Windows/Linux bisa menyusul.

**Bukan sasaran (fase ini)**
- Kolaborasi real-time, link berbagi, dan semua fitur yang bergantung pada server excalidraw.com: live collaboration, "shareable link", AI "Text to diagram"/"Wireframe to code", dan Excalidraw+.
- Code signing/notarization Apple, dan auto-update.
- Folder bertingkat di Drive (cukup satu folder aplikasi).
- Membuka file `.excalidraw` di Drive yang tidak dibuat oleh aplikasi ini. Scope `drive.file` tidak bisa melihat file seperti itu tanpa Google Picker. Untuk sekarang, file seperti itu bisa diunduh lalu dibuka sebagai file lokal.

**Anti-sasaran (gagal walaupun "jalan")**
- Ada pekerjaan yang hilang: saat offline, saat crash, saat app ditutup sebelum sinkron, atau saat konflik.
- Konflik diselesaikan diam-diam dengan menimpa salah satu versi.
- Token Google bisa dibaca kode renderer atau tersimpan sebagai teks biasa.
- UI editor terasa "beda" dari Excalidraw karena diubah atau dibangun ulang.

## 3. Batasan

- Mesin editor memakai paket resmi `@excalidraw/excalidraw` (MIT), bukan dibangun ulang. UI tambahan (menu file, dialog Drive, indikator sinkron) memakai titik kustomisasi resmi dari paket: `MainMenu`, `WelcomeScreen`, `renderTopRightUI`, `Footer`, serta komponen dialog yang gayanya mengikuti Excalidraw.
- Format data: format file `.excalidraw` standar (JSON berisi `elements`, `appState`, `files`), supaya file bisa dibuka di excalidraw.com dan sebaliknya.
- Akses Google memakai scope paling sempit: `drive.file` (aplikasi hanya melihat file yang dibuat atau dibukanya sendiri).
- Pengguna harus membuat OAuth Client ID tipe **Desktop app** di Google Cloud Console. Client ID dimasukkan lewat file `.env`, tidak di-commit.

## 4. Pendekatan

| Pendekatan | Kelebihan | Kekurangan |
|---|---|---|
| **Electron** (dipilih) | Mesin Chromium, sama dengan excalidraw.com, jadi tampilan dan perilakunya identik. Akses file dan OAuth desktop matang. | Installer ~100 MB, RAM lebih besar. |
| Tauri | Installer ~10 MB, hemat RAM. | Di macOS memakai WebKit (Safari): ada perbedaan font, clipboard, dan performa kanvas. Butuh Rust. |
| PWA | Paling sederhana, update otomatis. | Tidak terasa seperti aplikasi desktop sungguhan, akses file terbatas, bergantung pada browser. |

Pemilik aplikasi memilih **Electron, dengan menerapkan best practice**.

## 5. Desain

### 5.1 Stack

- Electron + TypeScript, dibuild dengan `electron-vite` (main, preload, renderer).
- Renderer: React + `@excalidraw/excalidraw`.
- Paket installer: `electron-builder`.
- Test: Vitest (logika storage dan sinkron), Playwright for Electron (smoke test end-to-end).
- Lint/format: ESLint + Prettier, TypeScript `strict`.

### 5.2 Arsitektur proses dan keamanan (best practice Electron)

```
┌────────────── Renderer (sandboxed) ──────────────┐
│ React + Excalidraw, UI file/Drive, status sinkron │
│ Hanya bicara ke main lewat window.sketchOut (typed)  │
└───────────────┬───────────────────────────────────┘
                │ contextBridge + ipcRenderer.invoke
┌───────────────▼─────────── Main ──────────────────┐
│ LocalFileService · DriveService · AuthService     │
│ CacheStore · SyncEngine · RecentFiles · Settings  │
└───────────────────────────────────────────────────┘
```

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`.
- Preload hanya mengekspos API bertipe yang sempit (`window.sketchOut.files.*`, `drive.*`, `auth.*`, `sync.*`). Tidak ada `ipcRenderer` mentah.
- Setiap handler IPC memvalidasi pengirim (frame milik app) dan memvalidasi input (dengan zod).
- Content-Security-Policy ketat. Navigasi dan `window.open` ke luar diblokir dan diarahkan ke browser sistem lewat `shell.openExternal` (hanya `https:`).
- Semua panggilan Google API dan semua token hanya ada di proses main. Renderer tidak pernah memegang token.
- Electron fuses: matikan `RunAsNode` dan opsi debug Node di build produksi.
- Single-instance lock. File `.excalidraw` yang dibuka dari Finder diarahkan ke instance yang sedang jalan.

### 5.3 Model dokumen

Setiap dokumen yang terbuka punya identitas:

```ts
type DocRef =
  | { kind: "local"; path: string }
  | { kind: "drive"; fileId: string | null; localId: string } // fileId null = belum pernah terunggah
```

Satu jendela berisi satu dokumen. Menu "New Window" membuka jendela baru, supaya beberapa dokumen bisa dibuka bersamaan.

### 5.4 Mode Lokal

- Buka/simpan memakai dialog native. Asosiasi file `.excalidraw` didaftarkan ke OS.
- **Autosave** ke file di disk, di-debounce 1 detik setelah perubahan terakhir. Penulisan atomik: tulis ke file sementara lalu rename, supaya file tidak rusak kalau crash di tengah penulisan. *(Keputusan saya: excalidraw.com tidak autosave ke file, tapi untuk aplikasi desktop autosave lebih aman.)*
- Dokumen baru yang belum punya path disimpan sebagai salinan pemulihan di folder data aplikasi sampai pengguna memilih lokasi simpan.
- File yang diubah dari luar app dideteksi lewat mtime saat jendela kembali difokuskan. Pengguna ditanya: muat ulang atau pertahankan versi di app.

### 5.5 Mode Google Drive

**Login (AuthService)**
- OAuth 2.0 untuk aplikasi desktop: browser sistem + redirect loopback `http://127.0.0.1:<port acak>` + PKCE.
- Refresh token dienkripsi dengan `safeStorage` Electron (Keychain di macOS) dan disimpan di folder data aplikasi.
- Logout: cabut (revoke) token dan hapus dari penyimpanan. Cache lokal yang belum tersinkron **tidak** dihapus tanpa konfirmasi.

**Penyimpanan di Drive (DriveService)**
- Folder `Sketch Out` di root My Drive, dibuat otomatis saat pertama kali dipakai. ID folder disimpan di settings.
- Setiap dokumen = satu file `<nama>.excalidraw` (mimeType `application/json`), plus `appProperties` untuk menandainya sebagai file Sketch Out.
- Dialog "Buka dari Drive": daftar file di folder itu (nama, waktu diubah, thumbnail opsional), dengan aksi buat baru, ganti nama, dan pindahkan ke trash.

**Cache lokal (CacheStore)**, di folder data aplikasi:
```
drive-cache/<localId>/
  doc.excalidraw        # salinan terbaru, selalu ditulis duluan
  meta.json             # fileId, name, baseVersion, dirty, lastSyncedAt, lastError
```
- Setiap perubahan di editor ditulis ke `doc.excalidraw` (debounce 500 ms, penulisan atomik), lalu ditandai `dirty: true`. Dengan begitu pekerjaan selalu aman di disk, online atau tidak.
- `baseVersion` = `version` file Drive (angka yang naik setiap file berubah) saat terakhir diunduh atau diunggah.

**Mesin sinkron (SyncEngine)**
- Status per dokumen: `synced` · `pending` (ada perubahan, menunggu) · `syncing` · `offline` · `error` · `conflict`.
- Pemicu unggah: dokumen `dirty` + online + jeda 2 detik tanpa perubahan. Juga saat app kembali online, saat app dibuka (untuk semua cache yang `dirty`), dan saat jendela ditutup (upaya terakhir).
- Deteksi online: event `online`/`offline` di renderer plus `net.isOnline()` di main, dan yang paling menentukan: hasil request sungguhan. Request yang gagal karena jaringan mengubah status jadi `offline` dan dicoba ulang dengan exponential backoff (2 detik sampai maksimal 60 detik).
- **Pengecekan konflik sebelum unggah**: ambil metadata `version` file di Drive. Kalau sama dengan `baseVersion`, unggah (update media) lalu simpan `version` baru sebagai `baseVersion`. Kalau berbeda (file diubah dari perangkat lain atau dari web), masuk status `conflict`.
- **Penanganan konflik**: tidak ada yang ditimpa. Versi lokal diunggah sebagai file baru `<nama> (konflik <tanggal-jam>).excalidraw`, lalu pengguna diberi tahu dan ditawari membuka versi Drive. *(Keputusan saya: untuk satu pengguna, "simpan keduanya" paling aman dan sederhana. Penggabungan otomatis per elemen ditunda ke fase tim.)*
- **Saat membuka dokumen Drive (online)**: bandingkan `version` di Drive dengan `baseVersion` di cache. Kalau sama, pakai cache. Kalau Drive lebih baru dan cache tidak `dirty`, unduh versi Drive. Kalau Drive lebih baru dan cache `dirty`, tangani sebagai konflik (lihat di bawah). Saat offline, langsung pakai cache.
- Dokumen yang sudah terbuka di satu jendela tidak dibuka di jendela kedua. Jendela yang sudah ada difokuskan, supaya tidak ada dua editor yang menulis ke cache yang sama.
- Dokumen Drive baru yang dibuat saat offline mendapat `localId` dan `fileId: null`, lalu dibuat di Drive saat online.
- Membuka file Drive saat offline: bisa, kalau ada di cache. Daftar file Drive menampilkan daftar terakhir yang di-cache, dengan tanda "offline".
- Token kedaluwarsa atau dicabut: status `error` dengan tombol "Login ulang". Data tetap aman di cache.
- Gambar tertanam (`files`) ikut tersimpan di dalam JSON yang sama, sesuai format standar.

**Indikator status (UI)**: ikon kecil di pojok kanan atas (`renderTopRightUI`) dengan gaya Excalidraw: ✓ Tersimpan ke Drive · ⟳ Menyinkron… · ● Offline — tersimpan di perangkat · ⚠ Konflik/Error (klik untuk detail). Untuk dokumen lokal: "Tersimpan" / "Menyimpan…".

### 5.6 Integrasi UI

- **Menu utama Excalidraw (hamburger)**: item bawaan tetap ada, ditambah: Baru, Buka file lokal…, Buka dari Google Drive…, Simpan sebagai (lokal / ke Drive), File terbaru, Akun Google (login/logout).
- **Welcome screen**: memakai `WelcomeScreen` Excalidraw, dengan pintasan ke Buka lokal, Buka dari Drive, dan file terbaru.
- **Menu aplikasi native macOS** (File/Edit/View/Window/Help) dengan shortcut standar: ⌘N, ⌘O, ⌘S, ⌘⇧S, ⌘W.
- Judul jendela: nama dokumen plus penanda belum tersimpan (dot di tombol close macOS lewat `setDocumentEdited`).
- Library Excalidraw dan preferensi (tema, bahasa) disimpan di folder data aplikasi.

### 5.7 Struktur proyek (usulan)

```
sketch-out/
  electron.vite.config.ts
  electron-builder.yml
  src/
    main/        # index.ts, ipc/, services/{auth,drive,localFile,cache,sync,recent,settings}
    preload/     # index.ts (contextBridge), api.d.ts
    renderer/    # App.tsx, components/{DriveDialog,SyncBadge,...}, hooks/
    shared/      # tipe & skema zod yang dipakai main+preload+renderer
  tests/         # unit (vitest) + e2e (playwright)
```

### 5.8 Pengujian

- Unit: SyncEngine dengan Drive palsu (fake). Skenario wajib: offline lalu online, unggah gagal di tengah, konflik `version`, dokumen baru dibuat offline, app ditutup saat `dirty` lalu dibuka lagi, token kedaluwarsa.
- Unit: penulisan atomik dan pemulihan cache.
- E2E (Playwright + Electron): buka app, gambar, simpan lokal, tutup, buka lagi, lalu isi file tetap utuh.
- Sinkron Drive sungguhan dicek manual (butuh akun Google).

### 5.9 Jalan menuju mode tim (tidak dibangun sekarang)

Lapisan storage berada di balik interface (`DocumentStore`), sehingga nanti bisa ditambah `CollabStore` yang terhubung ke server kolaborasi (misalnya server room Excalidraw open source / WebSocket). Format dokumen tetap `.excalidraw` standar. Mode tim akan wajib online, sesuai keinginan pemilik.

## 6. Diserahkan ke builder

- Pilihan library kecil: logger, zod, debounce, dan sejenisnya.
- Versi persis paket. Pakai versi stabil terbaru saat membangun.
- Detail visual dialog Drive, selama konsisten dengan gaya dialog Excalidraw.
- Thumbnail di daftar Drive boleh ditunda kalau memperlambat pekerjaan.
