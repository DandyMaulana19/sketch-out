# Sketch Out

Whiteboard desktop berbasis editor Excalidraw resmi (`@excalidraw/excalidraw`, MIT). File bisa disimpan di perangkat atau di Google Drive, dan mode Drive tetap bisa dipakai tanpa internet.

- **Lokal**: buka/simpan file `.excalidraw` biasa, simpan otomatis 1 detik setelah perubahan terakhir. Gambar tanpa judul dipulihkan otomatis setelah crash.
- **Mode folder**: buka satu folder (**File › Buka folder…**, `⌘⇧O`) untuk melihat semua catatan `.excalidraw` di dalamnya, termasuk di subfolder, dalam sidebar berbentuk pohon. Catatan yang dibuka muncul sebagai tab (`Ctrl+Tab` untuk pindah, `⌘W` untuk menutup tab). Sebelum pindah tab, perubahan disimpan dulu. Tab yang terbuka diingat per folder. Subfolder yang tidak berisi catatan tidak ditampilkan. Folder tersembunyi dan `node_modules` dilewati.
- **Google Drive**: setiap perubahan langsung disimpan dulu ke cache di perangkat. Saat online, perubahan diunggah ke folder `Sketch Out` di Drive. Saat offline, perubahan menunggu di cache dan diunggah otomatis begitu online lagi. Kalau file di Drive diubah dari tempat lain, versimu disimpan sebagai salinan `… (konflik YYYY-MM-DD HH.mm)`, jadi tidak ada yang tertimpa.

## Clone dan build sendiri (macOS Apple Silicon)

### Yang perlu disiapkan
- Mac dengan chip Apple Silicon (M1 atau lebih baru)
- [Node.js](https://nodejs.org/) 22 atau lebih baru (sudah termasuk npm). Cek dengan `node -v`.
- Git. Cek dengan `git --version`; kalau belum ada, macOS akan menawarkan untuk memasangnya.
- Ruang disk kosong sekitar 2 GB untuk dependensi dan proses build.

### Langkah
1. Clone repo, lalu masuk ke foldernya:

   ```bash
   git clone https://github.com/<username>/sketch-out.git
   ```

   ```bash
   cd sketch-out
   ```

2. Pasang dependensi:

   ```bash
   npm install
   ```

3. (Opsional) Kalau ingin fitur Google Drive, buat `.env` dulu. Lihat [Menghubungkan Google Drive](#menghubungkan-google-drive). Tanpa `.env`, app tetap jalan penuh untuk file lokal, mode folder, dan AI. Hanya login Google yang tidak tersedia.

4. Build installer:

   ```bash
   npm run dist
   ```

   Hasilnya `dist/Sketch Out-<versi>-arm64.dmg` (sekitar 93 MB).

5. Pasang: buka file `.dmg`, lalu seret **Sketch Out** ke folder **Applications**. Installer ini belum ditandatangani Apple, jadi saat pertama kali dibuka: klik kanan **Sketch Out** di Applications, pilih **Open**, lalu **Open** lagi. Cukup sekali.

**Mac Intel:** ganti `arch: [arm64]` menjadi `arch: [x64]` di `electron-builder.yml`, lalu jalankan `npm run dist`. Hasilnya `…-x64.dmg`. Versi ini belum dites secara rutin.

### Catatan build
- Semua dependensi app dibundel oleh Vite, jadi `node_modules` tidak ikut dikemas.
- DMG dikompres ulang dengan LZMA oleh `scripts/compress-dmg.cjs`.
- Font tulisan tangan CJK (Xiaolai, 12 MB) sengaja tidak disertakan, sehingga teks Mandarin/Jepang/Korea memakai font sistem.
- Mengganti logo: ubah `resources/icon.svg`, lalu render ulang PNG-nya (butuh Xcode Command Line Tools):

  ```bash
  swift scripts/render-icon.swift resources/icon.svg resources/icon.png
  ```

### Windows (x64)
Sebaiknya build **di mesin Windows**. `npm run dist:win` juga berhasil membuat installer dari Mac tanpa Wine, tetapi hasilnya tetap perlu dicoba di Windows.

**Yang perlu disiapkan**
- Windows 10 atau 11, 64-bit.
- [Node.js](https://nodejs.org/) 22 atau lebih baru (installer resmi sudah termasuk npm). Cek dengan `node -v` di PowerShell.
- [Git for Windows](https://git-scm.com/download/win).
- Ruang disk kosong sekitar 2 GB.

**Langkah** (di PowerShell atau Command Prompt):

1. Clone repo, masuk ke foldernya, lalu pindah ke branch `windows`:

   ```bash
   git clone https://github.com/<username>/sketch-out.git
   ```

   ```bash
   cd sketch-out
   ```

   ```bash
   git checkout windows
   ```

2. Pasang dependensi:

   ```bash
   npm install
   ```

3. (Opsional) Buat `.env` untuk Google Drive, sama seperti di macOS.

4. Build installer:

   ```bash
   npm run dist:win
   ```

   Hasilnya `dist\Sketch Out-<versi>-x64-setup.exe`.

5. Jalankan installer itu. Installer belum ditandatangani, jadi Windows SmartScreen akan memperingatkan: klik **More info**, lalu **Run anyway**. App dipasang untuk pengguna saat ini saja, tanpa hak admin.

**Bedanya dengan macOS**
- Pintasan memakai `Ctrl` sebagai ganti `⌘` (misalnya `Ctrl+Shift+O` untuk membuka folder).
- MCP memakai named pipe `\\.\pipe\sketch-out-…` sebagai ganti socket Unix.
- "Hubungkan ke AI" menulis pengaturan Claude Desktop di `%APPDATA%\Claude\claude_desktop_config.json` dan VS Code di `%APPDATA%\Code\User\mcp.json`. Cursor, Gemini CLI, dan OpenCode tetap di folder pengguna (`%USERPROFILE%\.cursor`, `.gemini`, `.config\opencode`). CLI seperti `claude` dan `codex` dijalankan lewat `cmd.exe`, jadi harus ada di PATH Windows.
- Versi Windows belum dites otomatis di Windows sungguhan. Unit test mencakup cabang-cabang khusus Windows, tetapi e2e baru dijalankan di macOS.

## Mengembangkan

Menjalankan app dalam mode pengembangan (reload otomatis):

```bash
npm run dev
```

Unit test:

```bash
npm test
```

Test end-to-end (membuka app sungguhan):

```bash
npm run build && npm run test:e2e
```

## Menghubungkan Google Drive

Login Google butuh OAuth Client milikmu sendiri:

1. Buka [Google Cloud Console](https://console.cloud.google.com/) dan buat project baru.
2. **APIs & Services › Library**: aktifkan **Google Drive API**.
3. **APIs & Services › OAuth consent screen**:
   - User type **External**, isi nama aplikasi dan email.
   - Scope: `.../auth/drive.file`, `openid`, `email`.
   - Biarkan di mode **Testing**, lalu tambahkan email Google-mu di **Test users**.
4. **APIs & Services › Credentials › Create credentials › OAuth client ID**, lalu pilih tipe **Desktop app**.
5. Salin `.env.example` menjadi `.env`, lalu isi:

   ```
   MAIN_VITE_GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
   MAIN_VITE_GOOGLE_CLIENT_SECRET=xxxxxxxx
   ```

   Untuk aplikasi desktop, Google memang menerbitkan "client secret" yang tidak benar-benar rahasia. Keamanan login dijamin oleh PKCE. Tetap jangan commit `.env`.
6. Jalankan ulang aplikasi (atau build ulang installer), lalu buka menu ☰ › **Masuk dengan Google…**.

Aplikasi hanya meminta izin `drive.file`: ia hanya bisa melihat file yang dibuatnya sendiri, bukan seluruh isi Drive-mu. File `.excalidraw` lama di Drive yang tidak dibuat oleh Sketch Out tidak terlihat. Unduh dulu file seperti itu, lalu buka sebagai file lokal.

## Menghubungkan ke AI (MCP)

Sketch Out punya MCP server sendiri, jadi AI seperti Claude Code, Codex, Claude Desktop, OpenCode, Gemini CLI, Cursor, dan VS Code bisa membaca dan menggambar di catatanmu. Hasilnya langsung muncul di kanvas, dan setiap perintah AI bisa dibatalkan dengan satu kali undo.

1. Buka menu ☰ › **Hubungkan ke AI…** (atau **Sketch Out › Hubungkan ke AI…**).
2. Klik **Hubungkan** pada AI yang kamu pakai. Sketch Out menulis pengaturannya sendiri: lewat `claude mcp add` atau `codex mcp add`, atau dengan menambah entri `sketch-out` di file pengaturan AI tersebut. Sebelum mengubah file, Sketch Out membuat cadangan `*.sketchout.bak`.
3. Minta AI-nya, misalnya: *"gambarkan alur login di catatan alur"*, atau *"rapikan diagram yang sedang kubuka"*.

Untuk AI lain yang mendukung MCP, pakai **Salin perintah** atau **Salin JSON**. Perintahnya adalah `"/Applications/Sketch Out.app/Contents/MacOS/Sketch Out" --mcp`.

Cara kerjanya: AI menjalankan `Sketch Out --mcp`, yang meneruskan permintaan ke Sketch Out yang sedang berjalan lewat socket lokal (`~/Library/Application Support/Sketch Out/mcp.sock`, hanya bisa diakses akunmu, tanpa port jaringan). Kalau Sketch Out belum terbuka, app dibuka otomatis.

Alat yang tersedia untuk AI:
- `get_workspace`, `list_notes`, `read_note`, `view_note` (gambar PNG)
- `add_elements`, `update_elements`, `delete_elements`
- `create_note`, `add_mermaid`

AI hanya bisa menyentuh folder dan file yang sudah kamu buka di Sketch Out, dan tidak bisa menghapus atau mengganti nama catatan.

Catatan yang diubah dari luar (oleh AI lewat file, atau editor lain) dimuat ulang otomatis bila tidak ada suntingan yang belum tersimpan.

## Keamanan

- Renderer berjalan di sandbox: `contextIsolation`, tanpa `nodeIntegration`, dengan CSP ketat. Ia hanya bisa memanggil API bertipe `window.sketchOut`, dan setiap input divalidasi dengan zod.
- Token Google hanya ada di proses utama, disimpan terenkripsi dengan Keychain macOS (`safeStorage`).
- Proses utama hanya membaca/menulis file yang dipilih sendiri oleh pengguna (lewat dialog, Finder, atau daftar terbaru).
- Electron fuses di build produksi: `RunAsNode` mati, integritas asar dicek.

## Struktur

```
src/main/      proses utama: jendela, menu, IPC, layanan (file, auth, drive, cache, sync)
src/preload/   jembatan window.sketchOut
src/renderer/  React + Excalidraw, dialog Drive, indikator status
src/shared/    tipe dan daftar channel IPC
tests/unit     Vitest
tests/e2e      Playwright + Electron
docs/superpowers/  desain dan rencana implementasi
```
