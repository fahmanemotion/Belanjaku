# Belanjaku — PIP Makassar

Aplikasi pengelolaan belanja Politeknik Ilmu Pelayaran Makassar (front-end).
Dibangun dengan **Next.js 16 (App Router) + React 19 + TypeScript**, tanpa library UI tambahan.

> Angka pengajuan, pencairan, dan pengesahan adalah **data contoh** (lihat `lib/data.ts`).
> Kertas Kerja POK memakai data FA Detail SAKTI (lihat bagian *Kertas Kerja POK* di bawah).
> Perubahan yang dibuat lewat form disimpan di memori browser dan hilang saat halaman di-refresh,
> kecuali FA Detail yang diunggah (tersimpan di browser tersebut).

## Masuk (login) & hak akses

Saat dibuka, aplikasi menampilkan halaman **Masuk**. Klik salah satu **akun demo** untuk mengisi form, lalu tekan **Masuk**.
Kata sandi demo untuk semua akun: **`pip2026`**. Untuk berpindah peran, klik nama di kanan atas → **Keluar / ganti akun**.

| Peran | Modul yang terbuka | Yang bisa dilakukan |
|---|---|---|
| Operator Unit | Dashboard, Belanja, Aktivitas, Referensi | Buat, ubah, hapus, dan ajukan pengajuan **unitnya sendiri** (hanya dokumen buatannya); melihat aktivitas dokumen unitnya; **upload FA Detail** |
| Administrator | Semua modul | Verifikasi pagu pengajuan, kelola pengguna & referensi, membuat pengajuan, **upload FA Detail**; melihat pencairan & pengesahan |
| PPK | Semua kecuali Pengguna | Setujui / tolak pengajuan yang sudah diverifikasi, terbitkan SPP |
| PPSPM | Semua kecuali Pengguna | Uji SPP dan terbitkan SPM |
| Bendahara Pengeluaran | Semua kecuali Pengguna | Catat SP2D terbit, sahkan belanja BLU (SP3B) |

Semua aturan ada di satu file: **`lib/akses.ts`** (tabel `AKSES`). Setiap aksi juga diperiksa lagi di `StoreProvider`,
dan alamat modul yang bukan haknya menampilkan halaman *akses ditolak*.
Login ini masih simulasi di browser; saat memakai Supabase Auth, pasang aturan yang sama di database (Row Level Security).

## Modul

| Route         | Isi |
|---------------|-----|
| `/dashboard`  | Pagu & jenis belanja dengan filter **Gabung / RM / BLU**, kartu BLU & RM, grafik Target vs Realisasi (batang / Kurva S), target per jenis belanja, tabel **Kegiatan Belanja / Kertas Kerja POK** (pilih lewat judul tabel) |
| `/belanja`    | Pengajuan belanja: Draf → Diajukan → Diverifikasi → Disetujui/Ditolak; MAK dari DIPA; edit/hapus oleh pembuat; cetak lembar pengajuan |
| `/aktivitas`  | Riwayat aktivitas (jejak audit): siapa, kapan, dokumen apa, apa yang berubah; lacak dokumen; ekspor CSV |
| `/pencairan`  | SPP → Uji SPP → SPM → SP2D, filter LS/GU/TUP |
| `/pengesahan` | Riwayat SP3B BLU per bulan dan pengesahan belanja BLU periode berjalan |
| `/referensi`  | Akun belanja (sesuai DIPA), unit kerja, penyedia, sumber dana |
| `/pengguna`   | Kelola pengguna & peran (khusus Administrator) |

### Kertas Kerja POK & upload FA Detail

Di Dashboard, klik judul tabel **Kegiatan Belanja** lalu pilih **Kertas Kerja POK**.

- **Kolom:** Uraian Kegiatan (uraian item + sub komponen), Kode MAK, Akun, Sumber Dana, Pagu, Realisasi (+ % serapan), Sisa Anggaran.
- **Filter:** sumber dana, jenis belanja (51/52/53), pencarian (uraian, kode MAK, akun, komponen), tombol **Upload FA Detail**.
- **Sumber dana divalidasi dari kode akun:** 525xxx (Barang BLU) dan 537xxx (Modal BLU) = **BLU**, akun lainnya = **RM**.
- **Sisa anggaran** = pagu − lock pagu − realisasi s.d. periode (sama dengan kolom SISA ANGGARAN di SAKTI).
- Baris total dan kotak ringkasan di atas tabel mengikuti filter; tabel menampilkan 50 baris, klik *Tampilkan … lagi* / *Tampilkan semua*.

**Upload FA Detail** (Administrator & Operator Unit): unduh dari SAKTI *Laporan Realisasi SP2D — FA Detail 16 Segmen*
per Program sampai **Item** (atau sampai Akun) dalam format **Excel (.xlsx)**, lalu klik **Upload FA Detail** dan pilih / seret filenya.
Sebelum diterapkan, aplikasi menampilkan ringkasan dan hasil validasi:

- total pagu, lock pagu, dan realisasi dicocokkan dengan baris **JUMLAH SELURUHNYA**;
- jumlah item dicocokkan dengan nilai akunnya; uraian yang terpotong pergantian halaman digabung otomatis;
- kode satker diperiksa (287494); akun di luar 51/52/53 diberi peringatan.

Setelah **Terapkan data**, tabel Kertas Kerja POK, daftar MAK di form pengajuan, dan batas sisa pagu MAK ikut memakai data baru,
lalu tercatat di riwayat aktivitas. File dibaca di browser (tanpa server); hasilnya disimpan di browser tersebut.
Data bawaan (`lib/pokBawaan.ts`) adalah FA Detail periode Oktober 2026: 462 MAK, 1.159 item, pagu Rp354.354.344.000.

### Cara angka di kartu BLU & RM dihitung

- **Total Belanja** = Nilai Pencairan + Nilai Pengesahan = total realisasi bulanan sumber dana tersebut.
- **BLU** — Pengesahan diambil dari SP3B BLU berstatus *Disahkan* (modul Pengesahan); Pencairan = belanja yang sudah cair tetapi belum disahkan.
- **RM** — Pengesahan = pertanggungjawaban UP lewat SPM GU Nihil; Pencairan = SP2D LS/UP/GU/TUP.

## Cara menjalankan di VS Code

Prasyarat: **Node.js 20.9 atau lebih baru** (disarankan Node 22 LTS).

1. Ekstrak ZIP, lalu buka foldernya di VS Code: `File → Open Folder… → belanjaku-pip`
2. Buka terminal VS Code (`Ctrl + \``) dan jalankan:

   ```bash
   npm install
   npm run dev
   ```

3. Buka **http://localhost:3000** di browser.

Perintah lain:

```bash
npm run build      # build produksi
npm start          # jalankan hasil build
npm run typecheck  # cek tipe TypeScript
```

Font (Bricolage Grotesque, Onest, JetBrains Mono) dimuat dari Google Fonts, jadi perlu koneksi internet.
Tanpa internet aplikasi tetap jalan dengan font sistem.

## Struktur folder

```
belanjaku-pip/
├── app/
│   ├── layout.tsx          # root layout: font, tema, StoreProvider, AppShell
│   ├── globals.css         # seluruh styling (token warna terang & gelap)
│   ├── icon.svg            # favicon (logo Belanjaku)
│   ├── page.tsx            # redirect ke /dashboard
│   ├── dashboard/page.tsx
│   ├── belanja/page.tsx
│   ├── pencairan/page.tsx
│   ├── pengesahan/page.tsx
│   ├── aktivitas/page.tsx
│   ├── referensi/page.tsx
│   └── pengguna/page.tsx
├── components/
│   ├── AppShell.tsx        # rail ikon kiri + navigasi pill atas + akun; menampilkan Login bila belum masuk
│   ├── Login.tsx           # halaman masuk + akun demo
│   ├── Logo.tsx            # logo & wordmark Belanjaku
│   ├── StoreProvider.tsx   # state bersama, sesi login, pemeriksaan hak akses, log aktivitas, toast
│   ├── Combobox.tsx        # pilihan yang bisa diketik (dipakai di form pengajuan)
│   ├── CetakKegiatan.tsx   # pratinjau & cetak lembar pengajuan (A4)
│   ├── UnggahFaDetail.tsx  # modal upload FA Detail SAKTI + ringkasan validasi
│   ├── Icon.tsx            # ikon SVG
│   ├── ui.tsx              # PageHead, Tabs, SearchBox, Status, Badge, Modal, Field
│   └── modules/            # satu file per modul
└── lib/
    ├── types.ts            # tipe data
    ├── akses.ts            # HAK AKSES per peran (modul & izin)
    ├── mak.ts              # tipe & penyusun data MAK / Kertas Kerja POK, sumber dana dari kode akun
    ├── faDetail.ts         # pembaca file FA Detail (.xlsx) SAKTI di browser + validasi
    ├── pokBawaan.ts        # data bawaan Kertas Kerja POK (hasil baca FA Detail Oktober 2026)
    ├── data.ts             # DATA CONTOH — pagu per jenis, realisasi bulanan, dll.
    └── format.ts           # format rupiah & tanggal Indonesia
```

## Menyambungkan ke Supabase (langkah berikutnya)

1. `npm install @supabase/supabase-js @supabase/ssr`
2. Buat `.env.local` berisi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Buat tabel sesuai tipe di `lib/types.ts` (`pengajuan_belanja`, `dokumen_pencairan`, `sp3b_blu`, `pengguna`, tabel referensi) serta tabel pagu per jenis belanja & sumber dana untuk dashboard.
   Untuk Kertas Kerja POK, simpan hasil `bacaFaDetail` (tipe `DataPok` di `lib/mak.ts`) ke tabel `kertas_kerja_pok` di dalam `terapkanPok`, agar semua pengguna melihat data yang sama.
4. Di `components/StoreProvider.tsx`, ganti nilai awal `useState(...)` dengan hasil query, lalu panggil `insert`/`update` Supabase di dalam fungsi aksi (`tambahBelanja`, `ubahStatusBelanja`, `buatSpp`, `majukanTahap`, `kirimSp3b`, `tambahPengguna`, `toggleAktifPengguna`, `setReferensi`).
# Belanjaku
