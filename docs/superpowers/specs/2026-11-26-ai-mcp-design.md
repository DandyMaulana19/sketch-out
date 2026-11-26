# Sketch Out × AI lewat MCP — Desain

## Tujuan dan alasan
Pengguna ingin AI yang sudah ia pakai (Claude Code, Claude Desktop, Codex, OpenCode, dan lain-lain) bisa membaca dan menggambar di Sketch Out, seperti pen.dev. Ia meminta Claude menggambar atau merapikan diagram, lalu hasilnya muncul langsung di kanvas. Penyambungannya harus bisa dilakukan dari dalam Sketch Out tanpa terminal, dan pengguna bebas memilih AI-nya.

- **Sasaran:**
  - Sketch Out menyediakan MCP server.
  - Jendela "Hubungkan ke AI…" mendaftarkan Sketch Out ke AI yang terdeteksi dengan sekali klik, sekaligus menampilkan status dan tombol putuskan.
  - Tersedia opsi salin perintah/JSON untuk AI lain.
  - Suntingan AI tampil langsung di kanvas dan bisa di-undo.
  - Catatan yang diubah dari luar (oleh AI atau editor lain) dimuat ulang otomatis bila tidak ada suntingan lokal yang belum tersimpan.
- **Bukan sasaran:**
  - panel chat AI di dalam app;
  - API key;
  - Google Drive (AI hanya menyentuh file lokal);
  - Windows/Linux.
- **Anti-sasaran:**
  - AI bisa membaca file di luar folder/file yang dibuka pengguna;
  - AI menghapus atau mengganti nama catatan;
  - pengaturan AI lain rusak atau tertimpa;
  - app membuka port jaringan;
  - ukuran app naik berarti (> 2 MB).

## Pendekatan
1. **Penghubung stdio dari app itu sendiri** (dipilih). AI menjalankan `Sketch Out --mcp`. Proses itu tidak membuka jendela dan menyembunyikan ikon Dock. Ia meneruskan baris JSON-RPC dari stdin ke socket Unix milik Sketch Out yang sedang berjalan, lalu sebaliknya. Spike sudah membuktikan Electron sanggup: stdout bersih dan mulai sekitar 0,6 detik. Cara ini didukung semua klien MCP dan tidak membuka port.
2. Server HTTP lokal: ditolak. Dukungan klien tidak merata, dan perlu token serta perlindungan DNS-rebinding.
3. Skrip Node terpisah: ditolak. Fuse `RunAsNode` mati, sehingga perlu runtime Node sendiri (sekitar 40 MB tambahan).

## Desain

### Penghubung (`--mcp`)
- Ditangani paling awal di `src/main/index.ts`, sebelum single-instance lock, `setAsDefaultProtocolClient`, dan pembuatan jendela. Langkahnya:
  - `app.dock.hide()`;
  - sambung ke socket;
  - pipe dua arah;
  - keluar saat stdin selesai atau socket putus.
- Kalau socket belum ada, penghubung **membuka Sketch Out** (spawn dirinya sendiri tanpa `--mcp`, detached), lalu menunggu socket maksimal 15 detik. Kalau gagal, ia membalas setiap request dengan error JSON-RPC "Sketch Out tidak bisa dibuka".
- Path socket: `<userData>/mcp.sock`. Kalau path lebih dari 100 karakter (batas socket Unix), pakai `os.tmpdir()/sketch-out-<hash userData>.sock`. Proses ini harus mengikuti `SKETCHOUT_USER_DATA` yang sama.
- Perintah yang didaftarkan:
  - versi terpaket: `<app.getPath("exe")> --mcp`;
  - mode dev: `<electron> <appPath> --mcp`.

### MCP server (di app utama)
- `net.createServer` di path socket dengan mode `0600`, dibuat sesudah `whenReady`. Socket basi dihapus dulu. Setiap koneksi adalah satu sesi MCP.
- Memakai `@modelcontextprotocol/sdk` (`McpServer` dengan transport kustom di atas socket, framing baris JSON seperti stdio). Library dibundel oleh Vite ke main. Keputusanku: protokolnya tidak ditulis tangan, dan ukuran app dicek tetap < +2 MB.
- Nama server `sketch-out`. Instruksi server menjelaskan model path dan sistem koordinat secara singkat.

### Alat (tools)
Semua path absolut harus lolos `assertGranted` / `assertGrantedDir`, yaitu hanya folder atau file yang sudah dibuka pengguna.

| Alat | Isi |
|---|---|
| `get_workspace` | Jendela yang terbuka: folder (path, catatan aktif) dan file tunggal, plus catatan yang sedang dilihat pengguna. |
| `list_notes {folder}` | Daftar catatan (path, rel, nama, mtime) di folder yang dibuka. |
| `read_note {path}` | Ringkasan elemen dalam JSON ringkas: id, type, x, y, width, height, angle, text/label, strokeColor, backgroundColor, fillStyle, strokeWidth, binding panah (start/end id), groupIds, frameId. Untuk catatan yang terbuka, dibaca dari kanvas langsung; selain itu dari file. Elemen terhapus disaring, jumlah dibatasi 2.000 elemen. |
| `view_note {path, maxSize?}` | Gambar PNG kanvas (konten MCP `image`, sisi terpanjang ≤ 1.600 px, default 1.200). |
| `add_elements {path, elements}` | Elemen kerangka Excalidraw (`convertToExcalidrawElements`): `rectangle`, `ellipse`, `diamond`, `text`, `arrow`, `line`, `frame`, dengan `label`, `start`/`end` (id elemen atau kerangka), warna, `id` opsional supaya bisa dirujuk. Maksimal 500 per panggilan. Mengembalikan id elemen yang dibuat. |
| `update_elements {path, updates: [{id, ...}]}` | Properti yang boleh diubah: x, y, width, height, angle, text, strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, opacity, fontSize. |
| `delete_elements {path, ids}` | Menghapus elemen (bisa di-undo). |
| `create_note {dir, name}` | Membuat catatan di folder/subfolder yang dibuka (aturan nama sama dengan sidebar), lalu membukanya sebagai tab. |
| `add_mermaid {path, mermaid}` | Mengubah kode Mermaid lewat `@excalidraw/mermaid-to-excalidraw`, lalu menyisipkan hasilnya. |

**Eksekusi:**
- Semua alat yang menyentuh kanvas (baca langsung, view, add, update, delete, mermaid) dijalankan di renderer jendela yang menampilkan catatan itu. Main mengirim `ai:request {id, op, args}`, dan renderer membalas lewat channel invoke `ai:respond {id, result | error}`. Batas waktunya 20 detik.
- Kalau catatan **belum terbuka**, main membukanya dulu:
  - catatan di folder yang terbuka: dibuka sebagai tab di jendela folder itu (tab aktif berpindah, mengikuti aturan flush biasa);
  - file tunggal: dibuka di jendelanya sendiri.
  Suntingan AI selalu terlihat oleh pengguna.
- Perubahan diterapkan dengan `updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY })`, sehingga satu panggilan alat = satu langkah undo. Simpan otomatis yang sudah ada lalu menulis ke file.
- Elemen baru tanpa koordinat diletakkan di bawah konten yang ada (ruang kosong pertama).

### Jendela "Hubungkan ke AI…"
- Dibuka dari menu ☰ dan menu app (**Sketch Out › Hubungkan ke AI…**).
- Daftar klien, masing-masing dengan status (Tidak terdeteksi / Belum terhubung / Terhubung / Perlu diperbarui, yaitu bila path perintah berbeda dari app saat ini):

| Klien | Deteksi | Daftar / lepas |
|---|---|---|
| Claude Code | CLI `claude` di PATH login shell | `claude mcp add -s user sketch-out -- <cmd>` / `claude mcp remove -s user sketch-out`; status dari `claude mcp get sketch-out` |
| Codex | CLI `codex` | `codex mcp add sketch-out -- <cmd>` / `codex mcp remove sketch-out`; status dari `codex mcp get sketch-out` |
| Claude Desktop | `/Applications/Claude.app` atau file config ada | `~/Library/Application Support/Claude/claude_desktop_config.json` → `mcpServers["sketch-out"] = {command, args}`; perlu restart Claude |
| OpenCode | CLI `opencode` atau `~/.config/opencode/` ada | `~/.config/opencode/opencode.json` → `mcp["sketch-out"] = {type: "local", command: [cmd...], enabled: true}` |
| Gemini CLI | `~/.gemini/` ada | `~/.gemini/settings.json` → `mcpServers["sketch-out"]` |
| Cursor | `~/.cursor/` ada | `~/.cursor/mcp.json` → `mcpServers["sketch-out"]` |
| VS Code | `~/Library/Application Support/Code/User/` ada | `…/Code/User/mcp.json` → `servers["sketch-out"] = {type: "stdio", command, args}` |

- **Lainnya:** tombol "Salin perintah" (path lengkap + `--mcp`) dan "Salin JSON" (blok `mcpServers`).
- **Aturan penulisan config:**
  - baca, ubah hanya kunci `sketch-out`, tulis atomik;
  - buat cadangan `<file>.sketchout.bak` sebelum penulisan pertama;
  - file yang gagal di-parse **tidak disentuh** (tampilkan "File pengaturan tidak bisa dibaca, salin JSON secara manual").
- CLI dijalankan lewat login shell pengguna (`$SHELL -lc`), karena app GUI tidak mewarisi PATH terminal (misalnya codex terpasang lewat nvm). Ada batas waktu 20 detik dan argumen di-escape.
- Proses main menangani semuanya lewat channel IPC baru `ai:clients`, `ai:connect {id}`, `ai:disconnect {id}`, `ai:copyConfig {kind}`. Renderer hanya mengirim id klien dari daftar tetap, tidak pernah path atau perintah.

### Muat ulang otomatis
- Jendela folder sudah menerima `folder:changed`. Untuk catatan aktif, renderer membandingkan mtime file dengan mtime simpanan terakhir:
  - kalau berbeda **dan** sesi tidak punya perubahan yang belum tersimpan, catatan dimuat ulang diam-diam lalu muncul toast "Diperbarui dari luar";
  - kalau ada perubahan lokal, dialog "File diubah di luar Sketch Out" yang lama tetap muncul.
- Jendela file tunggal memakai pengecekan saat fokus yang sudah ada, dengan aturan muat ulang diam-diam yang sama.
- Suntingan AI lewat MCP tidak memicu ini, karena ditulis oleh app sendiri (mtime diperbarui sinkron oleh sink).

## Test
- **Unit:**
  - transport socket dan penghubung: pipe dua arah, menutup saat stdin selesai;
  - path socket fallback untuk path panjang;
  - penulis config per klien (HOME tmp): menambah tanpa mengubah kunci lain, idempoten, tidak menyentuh file yang gagal di-parse, status "Perlu diperbarui" bila command berbeda, putuskan menghapus hanya `sketch-out`;
  - validasi argumen alat (zod), penolakan path di luar grant, batas jumlah elemen;
  - ringkasan elemen `read_note` dari scene fixture.
- **E2E (Playwright + Electron):**
  - app jalan dengan folder fixture;
  - test men-spawn `electron . --mcp` dengan `SKETCHOUT_USER_DATA` yang sama, lalu menjalankan `initialize`, `tools/list`, kemudian `add_elements` (kotak berlabel + panah);
  - hasilnya: scene di kanvas berisi elemen tersebut, file tersimpan, dan satu undo menghapus seluruh tambahan itu;
  - `read_note` path di luar folder → error;
  - `view_note` mengembalikan PNG;
  - muat ulang otomatis: file diubah dari luar saat tidak ada perubahan lokal → kanvas menampilkan isi baru.
- **Manual:** hubungkan Claude Code dari jendela, lalu jalankan `claude mcp get sketch-out` (status connected) dan minta satu diagram.

## Diserahkan ke pembangun
- Teks deskripsi alat untuk AI (singkat, dengan contoh kerangka).
- Gaya jendela "Hubungkan ke AI…" (ikut Modal yang ada).
- Detail penempatan elemen tanpa koordinat.
- Cara memverifikasi OpenCode membaca `opencode.json` (cek `opencode mcp list` saat build). Kalau ternyata `opencode.jsonc` yang dipakai, file `.jsonc` ber-komentar tidak diubah dan pengguna diminta memakai Salin JSON.

## Keputusanku saat pemeriksaan ala pembangun
- **Satu catatan terbuka di dua jendela** (file tunggal dan tab folder): request dikirim ke jendela yang terdaftar untuk catatan itu di `WindowRegistry`, yaitu yang terakhir menampilkannya.
- **Tidak ada jendela terbuka:** `get_workspace` mengembalikan daftar kosong ditambah folder terbaru. Alat yang memakai path di folder terbaru tetap jalan (folder dibuka dulu).
- API yang dipakai sudah dicek ada di versi terpasang: `CaptureUpdateAction` dan `convertToExcalidrawElements` di `@excalidraw/excalidraw` 0.18.1, serta `parseMermaidToExcalidraw` di `@excalidraw/mermaid-to-excalidraw`. MCP SDK yang dipakai adalah `@modelcontextprotocol/sdk` 1.32.x (devDependency, dibundel).
