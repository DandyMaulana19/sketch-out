# Mode Folder, Logo Pensil, dan Installer Kecil — Desain

## Tujuan dan alasan
Pengguna menyimpan beberapa catatan `.excalidraw` dalam satu folder. Ia ingin membuka **folder**, bukan file satu per satu, lalu pindah antar catatan di jendela yang sama. App juga harus sekecil mungkin di disk, dan logonya diganti jadi pensil.

- **Sasaran:**
  - membuka folder lokal;
  - sidebar berupa pohon catatan di folder itu beserta subfoldernya; hanya subfolder yang (di kedalaman berapa pun) berisi `.excalidraw` yang tampil;
  - tab untuk catatan yang sedang dibuka;
  - membuat catatan baru dari sidebar;
  - installer di kisaran ~80–90 MB.
- **Bukan sasaran:**
  - mode folder untuk Google Drive;
  - installer Intel/x64;
  - pindah ke Tauri.
- **Anti-sasaran (gagal meski secara teknis jalan):**
  - pindah tab sampai kehilangan gambar;
  - memori membengkak tiap kali tab ditambah;
  - membuka file tunggal dari Finder jadi berubah perilakunya.

## Pendekatan
1. **Satu jendela, satu kanvas aktif** (dipilih): hanya tab aktif yang memuat editor Excalidraw. Saat pindah tab, perubahan tab aktif disimpan dulu (flush), lalu kanvas berikutnya dimuat. Memori tetap rendah dan kode sesi simpan yang ada dipakai ulang apa adanya.
2. Semua tab tetap dimuat dan disembunyikan: pindah tab instan, tapi memori naik per tab. Ditolak.
3. Satu proses browser per tab: sekitar 100 MB RAM per tab. Ditolak karena pengguna ingin ringan.

Konsekuensi pendekatan 1 (keputusanku): riwayat undo tidak ikut terbawa ketika pindah tab.

## Desain

### Tampilan
Tampilannya: sidebar kiri (dengan tombol sembunyikan), lalu baris tab di atas kanvas, lalu kanvas Excalidraw.

- Sidebar berupa pohon: folder dulu lalu file, masing-masing urut nama; subfolder bisa dilipat. Folder tanpa catatan (di kedalaman berapa pun) tidak tampil. Folder tersembunyi (diawali `.`) dan `node_modules` dilewati. Pemindaian dibatasi kedalaman 8 dan 5.000 file supaya folder raksasa tidak membuat app macet.
- Tab dibuka dengan klik di sidebar dan ditutup dengan ×. Label tab = nama file; bila dua tab bernama sama, ditambah nama subfoldernya (`ide — riset`). Tooltip berisi path relatif.
- Pindah tab dengan `Ctrl+Tab` / `Ctrl+Shift+Tab`.
- Di jendela folder, `Cmd+W` menutup tab, bukan jendela. Kalau tab terakhir ditutup, muncul layar kosong bertuliskan "Pilih catatan di sidebar".
- Sidebar menyediakan:
  - "+ Catatan baru" di folder utama (minta nama; nama ganda diberi akhiran " 2"), dan klik kanan subfolder › "Catatan baru di sini";
  - menu klik kanan catatan berisi Ganti nama (tetap di subfolder yang sama) dan Pindahkan ke Tempat Sampah (dengan konfirmasi; bisa dipulihkan dari Trash).
- Tab dan baris sidebar untuk dokumen yang belum tersimpan diberi titik ●.

### Membuka folder
- Ada menu **File › Buka folder…** (`Cmd+Shift+O`), item di menu ☰, dan item di layar sambutan.
- Folder terakhir masuk ke daftar "Folder terbaru".
- Satu jendela per folder: membuka folder yang sudah terbuka hanya memfokuskan jendelanya (kunci registry `folder:<path>`).
- Tab yang terbuka dan tab aktif diingat per folder, lalu dipulihkan saat folder dibuka lagi.
- Membuka satu file dari Finder atau lewat "Buka…" tetap memakai jendela file tunggal seperti sekarang.

### Proses utama
- Izin folder: folder yang dipilih pengguna di-grant. `assertGranted` juga menerima file `.excalidraw` di dalam folder ber-grant (termasuk subfolder). Path dengan `..` atau symlink ke luar folder ditolak.
- Channel baru:
  - `folder:openDialog`, `folder:list` (nama + mtime), `folder:create`, `folder:rename`, `folder:trash`;
  - `folder:recent`, `folder:getTabs` / `folder:setTabs`;
  - event `folder:changed`.
  - Semua input divalidasi dengan zod, nama file tanpa `/`.
- Folder dipantau dengan `fs.watch` rekursif (dengan debounce sekitar 300 ms), sehingga sidebar ikut berubah saat file ditambah atau dihapus di Finder.
- Perubahan isi file dan file yang hilang memakai alur "berubah di luar" / "tidak ditemukan" yang sudah ada.

### Renderer
- `FolderWorkspace` menyimpan state tab (reducer murni yang bisa diuji: open/close/next/prev/rename/remove) dan merender `DocView` yang ada untuk tab aktif.
- Pindah tab menjalankan `session.flush()` lebih dulu. Kalau flush gagal, tab tetap di tempat dan error ditampilkan.
- Menutup jendela: alur flush-lalu-tutup yang ada sudah mencukupi, karena di mode folder setiap tab sudah punya file.

### Logo
Pensil putih diagonal dengan penghapus merah muda di atas kotak ungu `#6965db`, ditambah coretan bergelombang. Sumbernya `resources/icon.svg`, dirender ke `icon.png`.

### Installer kecil
- `@excalidraw/excalidraw`, `react`, `react-dom`, dan `zod` dipindah ke `devDependencies`, karena semuanya sudah dibundel oleh Vite (zod ikut dibundel ke main). Ini menghapus sekitar 200 MB `node_modules` dari `app.asar`.
- `electronLanguages: [en, id]`.
- Target mac hanya `arm64`.
- Ukuran dicek sesudah build. Targetnya installer ≤ 100 MB, dan app harus tetap jalan (smoke test).

## Test
- Unit:
  - reducer tab;
  - layanan folder: pemindaian rekursif hanya `.excalidraw`, subfolder kosong/tanpa catatan tidak muncul, nama ganda saat create/rename, penolakan path di luar folder;
  - aturan grant folder.
- E2E:
  - buka folder fixture (lewat hook E2E), pindah tab;
  - gambar di tab A, pindah ke B, lalu kembali: isi A tersimpan di file A, dan B tidak berubah.

## Diserahkan ke pembangun
Detail gaya sidebar dan tab (ikuti warna dan tema Excalidraw, terang/gelap), lebar sidebar, serta teks kecil di antarmuka.
