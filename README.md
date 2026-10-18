# Belanjaku — PIP Makassar

Aplikasi pengelolaan belanja Politeknik Ilmu Pelayaran Makassar (Satker 287494).

- **Aplikasi:** Next.js 16 (App Router) + React 19 + TypeScript, tanpa library UI tambahan.
- **Database & login:** Supabase (PostgreSQL, Auth, Storage, Realtime).
- **Hosting:** Vercel (region fungsi `sin1` Singapura, dekat dengan database di `ap-southeast-1`).

> Semua data tersimpan di database: pengajuan, pencairan, pengesahan, pengguna, referensi, riwayat aktivitas,
> Kertas Kerja POK, dan kartu **Pagu Belanja** di Dashboard (dihitung dari FA Detail yang diunggah).
> Yang **masih data contoh** dan diberi label *Data contoh*: kartu BLU & RM, grafik Target vs Realisasi,
> dan panel Target per Jenis Belanja (lihat `lib/data.ts`).

## Cara kerja singkat

| Bagian | Cara kerja |
|---|---|
| Login | Supabase Auth (email + kata sandi). Akun dibuat Administrator; tidak ada pendaftaran publik. |
| Membaca data | Browser membaca tabel lewat Supabase dengan **Row Level Security (RLS)**: pengguna nonaktif tidak bisa membaca apa pun, Operator Unit hanya melihat pengajuan unitnya. |
| Mengubah data | **Hanya lewat fungsi RPC di database** (`buat_pengajuan`, `ubah_status_pengajuan`, `buat_spp`, dst.). Setiap fungsi memeriksa peran, pemilik dokumen, status, dan sisa pagu MAK, lalu mencatat riwayat aktivitas dalam satu transaksi. Browser tidak bisa INSERT/UPDATE/DELETE langsung. |
| Kelola akun | Tambah/ubah/hapus pengguna dan atur ulang kata sandi lewat API server Next.js (`app/api/pengguna/…`) memakai *secret key*. Pemanggil diperiksa: harus Administrator aktif. |
| File FA Detail | File asli `.xlsx` disimpan di Storage bucket privat **`fa-detail`**. |
| Realtime | Perubahan oleh pengguna lain langsung tampil tanpa refresh. |

## Project Supabase yang sudah terpasang

| | |
|---|---|
| Project | `belanjaku-pip` (ref `qqoltdrwlbeaeyjerszk`), region Singapore |
| URL | `https://qqoltdrwlbeaeyjerszk.supabase.co` |
| Skema | `supabase/migrations/20261018210500_belanjaku_skema.sql` — **sudah dijalankan** |
| Data awal | `supabase/seed/01_referensi.sql` (3 sumber dana, 8 unit kerja, 2 penyedia, 41 akun) dan `supabase/seed/02_pok_oktober_2026.sql` (FA Detail Oktober 2026: 462 MAK, 1.159 item, pagu Rp354.354.344.000) — **sudah dijalankan** |

### Langkah pertama (sekali saja, di dashboard Supabase)

1. **Buat akun Administrator pertama** — *Authentication → Users → Add user → Create new user*.
   Isi email & kata sandi, **centang _Auto Confirm User_**, lalu *Create user*.
   Akun pertama otomatis menjadi **Administrator** (unit UK01). Nama awal diambil dari email; ubah di modul **Pengguna**.
2. **Matikan pendaftaran publik** — *Authentication → Sign In / Providers*, bagian *User Signups*:
   matikan **Allow new users to sign up** → *Save changes*.
   Akun berikutnya dibuat dari modul **Pengguna** di aplikasi.
3. **Salin secret key** — *Project Settings → API Keys → Secret keys* (`sb_secret_…`) untuk `SUPABASE_SECRET_KEY`.

> Lakukan langkah 1–2 **sebelum** aplikasi di-deploy, karena akun pertama yang dibuat akan menjadi Administrator.

## Variabel lingkungan

| Nama | Isi | Sifat |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL project Supabase | Publik |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key `sb_publishable_…` (boleh juga anon key lama) | Publik — aman di browser |
| `SUPABASE_SECRET_KEY` | Secret key `sb_secret_…` (boleh juga service_role lama) | **RAHASIA** — hanya di server |

- Di komputer: file **`.env.local`** (contoh di `.env.example`). File ini sudah diabaikan git — jangan di-commit.
- Di Vercel: *Project → Settings → Environment Variables*. Setelah mengubah nilainya, lakukan **Redeploy**.
- Jangan pernah memberi awalan `NEXT_PUBLIC_` pada secret key.
- Tanpa `SUPABASE_SECRET_KEY` aplikasi tetap jalan, tetapi modul Pengguna tidak bisa menambah/mengubah akun.

## Menjalankan di komputer (VS Code)

Prasyarat: **Node.js 20.9 atau lebih baru** (disarankan Node 22 LTS).

```bash
npm install
npm run dev
```

Buka **http://localhost:3000**, masuk dengan akun Administrator.

```bash
npm run build      # build produksi
npm start          # jalankan hasil build
npm run typecheck  # cek tipe TypeScript
```

Font (Bricolage Grotesque, Onest, JetBrains Mono) dimuat dari Google Fonts; tanpa internet aplikasi memakai font sistem.

## Deploy ke Vercel

1. Push kode ke GitHub (`fahmanemotion/Belanjaku`).
2. Buka **vercel.com/new** → *Import* repository **Belanjaku** (Framework: Next.js, terdeteksi otomatis).
3. Buka bagian **Environment Variables**, tempel isi `.env.local` (Vercel memecah tiap baris `NAMA=nilai` otomatis),
   pastikan ketiga variabel di atas terisi, lalu **Deploy**.
4. Setiap `git push` ke branch `main` akan di-deploy otomatis.

## Masuk (login) & hak akses

| Peran | Modul yang terbuka | Yang bisa dilakukan |
|---|---|---|
| Operator Unit | Dashboard, Belanja, Aktivitas, Referensi | Buat, ubah, hapus, dan ajukan pengajuan **unitnya sendiri** (hanya dokumen buatannya); melihat aktivitas dokumen unitnya; **upload FA Detail** |
| Administrator | Semua modul | Verifikasi pagu pengajuan, kelola pengguna & referensi, membuat pengajuan, **upload FA Detail**; melihat pencairan & pengesahan |
| PPK | Semua kecuali Pengguna | Setujui / tolak pengajuan yang sudah diverifikasi, terbitkan SPP |
| PPSPM | Semua kecuali Pengguna | Uji SPP dan terbitkan SPM |
| Bendahara Pengeluaran | Semua kecuali Pengguna | Catat SP2D terbit, sahkan belanja BLU (SP3B) |

- Aturan tampilan ada di **`lib/akses.ts`** (tabel `AKSES`); aturan yang sama tersimpan di database (tabel **`izin_peran`**)
  dan dipakai RLS serta fungsi RPC. Bila pembagian tugas berubah, ubah **keduanya**.
- Lupa kata sandi: Administrator mengatur ulang lewat modul **Pengguna**. Pengguna bisa mengganti sandinya sendiri
  lewat menu akun (kanan atas) → **Ganti kata sandi**. Kata sandi minimal 8 karakter, berisi huruf dan angka.
- Pengguna yang **dinonaktifkan** tidak bisa masuk dan langsung keluar bila sedang membuka aplikasi.
  Pengguna yang **dihapus** akun loginnya dihapus, tetapi namanya tetap tampil di riwayat dan dokumen buatannya.

## Modul

| Route         | Isi |
|---------------|-----|
| `/dashboard`  | Pagu & jenis belanja dari FA Detail (filter **Gabung / RM / BLU**), kartu BLU & RM, grafik Target vs Realisasi, target per jenis belanja, tabel **Kegiatan Belanja / Kertas Kerja POK** (pilih lewat judul tabel) |
| `/belanja`    | Pengajuan belanja: Draf → Diajukan → Diverifikasi → Disetujui/Ditolak; MAK dari Kertas Kerja POK; edit/hapus oleh pembuat; cetak lembar pengajuan |
| `/aktivitas`  | Riwayat aktivitas (jejak audit): siapa, kapan, dokumen apa, apa yang berubah; lacak dokumen; ekspor CSV |
| `/pencairan`  | SPP → Uji SPP → SPM → SP2D, filter LS/GU/TUP |
| `/pengesahan` | Riwayat SP3B BLU per bulan dan pengesahan belanja BLU periode berjalan |
| `/referensi`  | Akun belanja, unit kerja, penyedia, sumber dana (tambah & ubah oleh Administrator) |
| `/pengguna`   | Kelola pengguna, peran, status, atur ulang kata sandi (khusus Administrator) |

Nomor dokumen dibuat database: pengajuan `BLJ-2026-0001`, SPP `00001/SPP-LS/2026`, SP3B `SP3B-BLU-10/2026`
(bulan menurut waktu Makassar). Nomor tidak dipakai ulang walau dokumennya dihapus.

### Kertas Kerja POK & upload FA Detail

Di Dashboard, klik judul tabel **Kegiatan Belanja** lalu pilih **Kertas Kerja POK**.

- **Kolom:** Uraian Kegiatan (uraian item + sub komponen), Kode MAK, Akun, Sumber Dana, Pagu, Realisasi (+ % serapan), Sisa Anggaran.
- **Sumber dana dari kode akun:** 525xxx (Barang BLU) dan 537xxx (Modal BLU) = **BLU**, akun lainnya = **RM**.
- **Sisa anggaran** = pagu − lock pagu − realisasi s.d. periode (sama dengan kolom SISA ANGGARAN di SAKTI).
- Tabel dibagi per halaman, **30 baris per halaman**. Warna sumber dana: **RM gelap**, **BLU oranye**.

**Upload FA Detail** (Administrator & Operator Unit): unduh dari SAKTI *Laporan Realisasi SP2D — FA Detail 16 Segmen*
per Program sampai **Item** (atau sampai Akun) dalam format **Excel (.xlsx)**, klik **Upload FA Detail**, pilih / seret filenya.
Aplikasi menampilkan ringkasan dan hasil validasi (total dicocokkan dengan baris **JUMLAH SELURUHNYA**, jumlah item dengan nilai akun,
kode satker 287494). Setelah **Terapkan data**:

- file asli disimpan di Storage `fa-detail`, isinya disimpan di tabel `pok_*`, dan menjadi **POK aktif** untuk tahunnya
  (unggahan lama tetap tersimpan sebagai riwayat);
- kartu **Pagu Belanja**, tabel Kertas Kerja POK, daftar MAK di form pengajuan, dan batas sisa pagu MAK langsung memakai data baru
  untuk semua pengguna; unggahan tercatat di riwayat aktivitas.

### Cara angka di kartu dihitung

- **Pagu Belanja (RM + BLU)** = jumlah pagu, lock, dan realisasi per jenis belanja (51 Pegawai, 52 Barang, 53 Modal) dari FA Detail aktif.
- **Kartu BLU & RM** (masih data contoh): Total Belanja = Nilai Pencairan + Nilai Pengesahan.

## Database

| Objek | Isi |
|---|---|
| `izin_peran` | Matriks izin per peran (sama dengan `lib/akses.ts`) |
| `unit_kerja`, `sumber_dana`, `akun`, `penyedia` | Referensi |
| `pengguna` | Profil pengguna, tertaut ke akun Supabase Auth (`auth_id`) |
| `pengajuan`, `spp`, `sp3b`, `pengesahan` | Alur dokumen belanja; view `v_pengajuan` untuk dibaca aplikasi |
| `aktivitas` | Riwayat aktivitas (hanya bertambah) |
| `pok_unggahan`, `pok_uraian`, `pok_mak`, `pok_item` | Kertas Kerja POK dari FA Detail |
| Skema `app` | Fungsi bantu & penghitung nomor dokumen (tidak terbuka lewat API) |

Fungsi RPC yang dipanggil aplikasi: `buat_pengajuan`, `ubah_pengajuan`, `hapus_pengajuan`, `ubah_status_pengajuan`,
`buat_spp`, `majukan_tahap_spp`, `sahkan_pengajuan`, `catat_aktivitas`, `jejak_dokumen`, `simpan_referensi`,
`terapkan_pok`, `pok_aktif`. Fungsi `admin_*` hanya bisa dipanggil API server (service role).

> **Security Advisor** Supabase menampilkan peringatan *"Signed-In Users Can Execute SECURITY DEFINER Function"* untuk fungsi RPC di atas.
> Ini disengaja: fungsi-fungsi itulah satu-satunya jalan mengubah data, dan setiap fungsi memeriksa peran & status di dalamnya.
> Pengguna yang belum login (anon) tidak punya akses ke tabel maupun fungsi apa pun.

### Memasang di project Supabase baru (mis. untuk uji coba)

1. Buat project baru di Supabase.
2. Buka **SQL Editor**, jalankan berurutan isi file: `supabase/migrations/20261018210500_belanjaku_skema.sql`,
   `supabase/seed/01_referensi.sql`, lalu `supabase/seed/02_pok_oktober_2026.sql`.
3. Ikuti *Langkah pertama* di atas, lalu isi variabel lingkungan dengan URL & kunci project baru.

`supabase/rollback/20261018210500_belanjaku_skema_down.sql` menghapus seluruh skema **beserta semua datanya** — hanya untuk uji coba.

## Struktur folder

```
belanjaku-pip/
├── app/
│   ├── layout.tsx          # root layout: font, tema, StoreProvider, AppShell
│   ├── globals.css         # seluruh styling (token warna terang & gelap)
│   ├── page.tsx            # redirect ke /dashboard
│   ├── <modul>/page.tsx    # dashboard, belanja, aktivitas, pencairan, pengesahan, referensi, pengguna
│   └── api/pengguna/       # API server kelola akun (route.ts, [id]/route.ts, [id]/sandi/route.ts)
├── components/
│   ├── AppShell.tsx        # rail ikon + navigasi + menu akun; Login bila belum masuk
│   ├── Login.tsx           # halaman masuk (Supabase Auth)
│   ├── GantiSandi.tsx      # ganti kata sandi sendiri
│   ├── StoreProvider.tsx   # sesi, data dari Supabase, realtime, aksi (RPC), hak akses, toast
│   ├── Combobox.tsx, CetakKegiatan.tsx, UnggahFaDetail.tsx, KolomKegiatan.tsx, Icon.tsx, Logo.tsx, ui.tsx
│   └── modules/            # satu file per modul
├── lib/
│   ├── supabase.ts         # klien Supabase di browser (publishable key)
│   ├── supabaseServer.ts   # klien server (secret key) + pemeriksaan Administrator untuk API
│   ├── db.ts               # pemuat data & pemetaan baris database → tipe aplikasi
│   ├── akses.ts            # HAK AKSES per peran (modul & izin)
│   ├── mak.ts              # tipe & penyusun data MAK / Kertas Kerja POK
│   ├── faDetail.ts         # pembaca file FA Detail (.xlsx) SAKTI di browser + validasi
│   ├── data.ts             # konstanta & DATA CONTOH dashboard
│   ├── types.ts            # tipe data
│   └── format.ts           # format rupiah & tanggal Indonesia
├── supabase/
│   ├── migrations/         # skema database (tabel, RLS, RPC, storage, realtime)
│   ├── seed/               # data awal referensi & Kertas Kerja POK
│   └── rollback/           # penghapus skema (uji coba)
├── .env.example            # contoh variabel lingkungan
└── vercel.json             # region fungsi Vercel (sin1)
```

## Pemecahan masalah

| Gejala | Penyebab & solusi |
|---|---|
| Layar *"Belanjaku belum tersambung ke database"* | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` kosong. Komputer: isi `.env.local` lalu jalankan ulang `npm run dev`. Vercel: isi Environment Variables lalu **Redeploy**. |
| *"Akun ini belum terdaftar di Belanjaku"* | Akun login ada di Supabase Auth tetapi belum punya profil. Buat pengguna lewat modul Pengguna (bukan dari dashboard Supabase), kecuali akun Administrator pertama. |
| *"Server belum dikonfigurasi: isi SUPABASE_SECRET_KEY…"* saat menambah pengguna | Isi `SUPABASE_SECRET_KEY` (lalu jalankan ulang / Redeploy). |
| *"Akun ini nonaktif"* | Akun dinonaktifkan Administrator; aktifkan lagi di modul Pengguna. |
| Data tidak muncul setelah upload FA Detail | Pastikan file `.xlsx` hasil SAKTI *FA Detail 16 Segmen* dan hasil validasi tidak berisi galat. |
