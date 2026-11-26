# Sketch Out

Whiteboard desktop berbasis editor Excalidraw resmi (`@excalidraw/excalidraw`, MIT). File bisa disimpan di perangkat atau di Google Drive, dan mode Drive tetap bisa dipakai tanpa internet.

- **Lokal**: buka/simpan file `.excalidraw` biasa, simpan otomatis 1 detik setelah perubahan terakhir. Gambar tanpa judul dipulihkan otomatis setelah crash.
- **Mode folder**: buka satu folder (**File › Buka folder…**, `⌘⇧O`) untuk melihat semua catatan `.excalidraw` di dalamnya, termasuk di subfolder, dalam sidebar berbentuk pohon. Catatan yang dibuka muncul sebagai tab (`Ctrl+Tab` untuk pindah, `⌘W` untuk menutup tab). Sebelum pindah tab, perubahan disimpan dulu. Tab yang terbuka diingat per folder. Subfolder yang tidak berisi catatan tidak ditampilkan. Folder tersembunyi dan `node_modules` dilewati.
- **Google Drive**: setiap perubahan langsung disimpan dulu ke cache di perangkat. Saat online, perubahan diunggah ke folder `Sketch Out` di Drive. Saat offline, perubahan menunggu di cache dan diunggah otomatis begitu online lagi. Kalau file di Drive diubah dari tempat lain, versimu disimpan sebagai salinan `… (konflik YYYY-MM-DD HH.mm)`, jadi tidak ada yang tertimpa.

## Menjalankan

```bash
npm install
```

```bash
npm run dev
```

## Test

```bash
npm test
```

```bash
npm run build && npm run test:e2e
```

## Membuat installer macOS

```bash
npm run dist
```

Hasilnya ada di `dist/Sketch Out-<versi>-arm64.dmg` (khusus Apple Silicon, sekitar 93 MB, dikompres ulang dengan LZMA oleh `scripts/compress-dmg.cjs`). Proses ini butuh sekitar 1 GB ruang disk kosong. Semua dependensi app dibundel oleh Vite, jadi `node_modules` tidak ikut dikemas. Font tulisan tangan CJK (Xiaolai, 12 MB) sengaja tidak disertakan, sehingga teks Mandarin/Jepang/Korea memakai font sistem. Installer belum ditandatangani (code signing), jadi saat pertama kali dibuka: klik kanan aplikasinya, lalu pilih **Open**.

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
