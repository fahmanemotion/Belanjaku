# Belanjaku — PIP Makassar

Aplikasi pengelolaan belanja Politeknik Ilmu Pelayaran Makassar (Satker 287494).

- **Aplikasi:** Next.js 16 (App Router) + React 19 + TypeScript, tanpa library UI tambahan.
- **Database & login:** Supabase (PostgreSQL, Auth, Storage, Realtime).
- **Hosting:** Vercel (region fungsi `sin1` Singapura, dekat dengan database di `ap-southeast-1`).

> Semua data tersimpan di database: dokumen belanja, rekap pencairan & pengesahan, pengguna, referensi,
> riwayat aktivitas, Kertas Kerja POK, kartu **Pagu Belanja** (dari FA Detail yang diunggah), dan kartu **BLU & RM**
> (dari rekap pencairan & pengesahan). Yang **masih data contoh** dan diberi label *Data contoh*: grafik
> Target vs Realisasi dan panel Target per Jenis Belanja (lihat `lib/data.ts`).

## Alur dokumen

```
Belanja                         Pencairan                            Pengesahan
(Operator Pengadaan)            (Operator Pencairan)                 (Operator Pengesahan)
catat kegiatan          ──▶     Daftar: centang → Cairkan     ──▶    Daftar: centang → Sahkan
                                Riwayat Pencairan                    Riwayat Pengesahan
status: Belum dicairkan         status: Dicairkan (CAIR-2026-…)      status: Disahkan (SAH-2026-…)
```

1. **Belanja** — bagian pengadaan barang/jasa mencatat semua dokumen belanja kebutuhan unit kerja di satu tempat
   (boleh beberapa operator sekaligus, untuk unit kerja mana pun). Dokumen yang tersimpan **langsung masuk Daftar Pencairan**.
   Dokumen hanya bisa diubah / dihapus oleh **pencatatnya** dan hanya **selama belum dicairkan**.
   Kolom **Nilai** langsung berformat ribuan saat diketik (*5.000.000*) dan menampilkan terbilangnya. Pencatatan belanja
   **tidak dipengaruhi sisa anggaran** MAK di FA Detail — tanpa pembatasan maupun notifikasi.
2. **Pencairan** — Operator Pencairan membuka **Daftar** Pencairan, **mencentang** kegiatan yang dibayarkan ke
   penyedia/pihak ketiga (kotak centang per baris, centang satu halaman, atau *Pilih semua*; jumlah & total tampil di
   bar ceklist bawah), lalu klik **Cairkan** (isi tanggal, jenis pembayaran LS/GU/TUP, No. SP2D/SPM bila ada).
   Kegiatan terpilih hilang dari Daftar, pindah ke **Riwayat Pencairan** sebagai histori kegiatan yang dibayarkan,
   dan otomatis masuk Daftar Pengesahan.
3. **Pengesahan** — Operator Pengesahan membuka **Daftar** Pengesahan (berisi kegiatan yang sudah dicairkan), mencentang
   kegiatan yang disahkan, lalu klik **Sahkan**. Kegiatan pindah ke **Riwayat Pengesahan**. Tanggal pengesahan tidak boleh
   sebelum tanggal pencairan. **Di sinilah sisa anggaran berlaku**: form Sahkan menampilkan *Sisa anggaran per MAK* dan
   tombol Sahkan terkunci bila total kegiatan terpilih pada suatu MAK melebihi sisanya (lihat *Sisa anggaran saat pengesahan*).

- Administrator boleh mencairkan maupun mengesahkan. Operator Pencairan dan Operator Pengesahan masing-masing **hanya satu akun aktif**.
- Setiap Cairkan/Sahkan membentuk **rekap bernomor** (CAIR-… / SAH-…) berisi **satu sumber dana**. Daftar punya tab
  **Semua / RM / BLU**; bila yang dicentang campuran RM dan BLU, aplikasi otomatis membuat satu rekap untuk setiap sumber dana.
- **Riwayat** menampilkan **tabel rekapan**: Uraian (mis. *Pencairan 01*, *Pengesahan 01*), tanggal, sumber dana, dan nominal.
  Tombol **Lihat daftar** di kolom Aksi mengganti tabel itu dengan daftar kegiatan yang sudah dicairkan / disahkan pada
  rekap tersebut; tombol *Kembali ke tabel rekapan* untuk kembali. Uraian mengikuti nomor rekap (CAIR-2026-0001 → Pencairan 01).
- Rekap yang keliru bisa **dibatalkan** dari daftar kegiatan rekapnya di Riwayat (wajib alasan); kegiatannya kembali ke daftar dan nomor rekap
  tidak dipakai lagi. Rekap pencairan tidak bisa dibatalkan bila sebagian kegiatannya sudah disahkan — batalkan rekap
  pengesahannya dulu.
- Semua langkah (catat, ubah, hapus, rekap, batal) tercatat di **Riwayat Aktivitas**; nomor dokumen dan nomor rekap bisa dilacak.

### Sisa anggaran saat pengesahan

- **Sisa anggaran MAK** = pagu − lock − realisasi pada FA Detail aktif **dikurangi** kegiatan MAK itu yang sudah disahkan
  sejak FA Detail tersebut diunggah (pengesahan sesudah unggahan belum tercatat sebagai realisasi di file itu).
  Setelah FA Detail baru diunggah, perhitungan mulai lagi dari realisasi file baru — pengesahan lama tidak dihitung dua kali.
- Saat **Sahkan**, total kegiatan terpilih per MAK tidak boleh melebihi sisa tersebut; MAK yang tidak ada di FA Detail aktif
  juga ditolak. Database memeriksa ulang (`buat_rekap_pengesahan`) dan pengesahan berjalan bergiliran, sehingga dua operator
  tidak bisa memakai sisa yang sama bersamaan.
- Mencatat, mengubah, dan mencairkan belanja **tidak** dibatasi sisa anggaran.

## Cara kerja singkat

| Bagian | Cara kerja |
|---|---|
| Login | Supabase Auth (email + kata sandi). Akun dibuat Administrator; tidak ada pendaftaran publik. |
| Membaca data | Browser membaca tabel lewat Supabase dengan **Row Level Security (RLS)**: pengguna nonaktif tidak bisa membaca apa pun. |
| Mengubah data | **Hanya lewat fungsi RPC di database** (`buat_pengajuan`, `buat_rekap_pencairan`, `buat_rekap_pengesahan`, dst.). Setiap fungsi memeriksa peran, pencatat dokumen, status, sumber dana, dan (saat pengesahan) sisa anggaran MAK, lalu mencatat riwayat aktivitas dalam satu transaksi. Browser tidak bisa INSERT/UPDATE/DELETE langsung. |
| Kelola akun | Tambah/ubah/hapus pengguna dan atur ulang kata sandi lewat API server Next.js (`app/api/pengguna/…`) memakai *secret key*. Pemanggil diperiksa: harus Administrator aktif. |
| File FA Detail | File asli `.xlsx` disimpan di Storage bucket privat **`fa-detail`**. |
| Realtime | Perubahan oleh pengguna lain langsung tampil tanpa refresh. |

## Project Supabase yang sudah terpasang

| | |
|---|---|
| Project | `belanjaku-pip` (ref `qqoltdrwlbeaeyjerszk`), region Singapore |
| URL | `https://qqoltdrwlbeaeyjerszk.supabase.co` |
| Skema | 1. `supabase/migrations/20261018210500_belanjaku_skema.sql` — **sudah dijalankan**<br>2. `supabase/migrations/20261019090000_alur_rekap_pencairan.sql` — alur rekap pencairan & pengesahan — **sudah dijalankan**<br>3. `supabase/migrations/20261019103000_peran_operator_pengesahan.sql` — peran Operator Pengesahan — **sudah dijalankan**<br>4. `supabase/migrations/20261019150000_sisa_anggaran_saat_pengesahan.sql` — sisa anggaran diperiksa saat pengesahan<br>5. `supabase/migrations/20261019160000_peran_baru_tanpa_unit.sql` — susunan peran baru, pengguna tanpa unit kerja<br>(4 dan 5: **jalankan sekali** lewat SQL Editor, boleh sekaligus dalam satu tempelan — lihat *Memperbarui database*) |
| Data awal | `supabase/seed/01_referensi.sql` (3 sumber dana, 8 unit kerja, 2 penyedia, 41 akun) dan `supabase/seed/02_pok_oktober_2026.sql` (FA Detail Oktober 2026: 462 MAK, 1.159 item, pagu Rp354.354.344.000) — **sudah dijalankan** |

### Memperbarui database (migrasi baru)

Setiap file baru di `supabase/migrations/` dijalankan **sekali**, berurutan menurut nama file, **sebelum** kode versi
barunya di-push:

1. Dashboard Supabase → **SQL Editor** → *New query*.
2. Buka file migrasinya di VS Code, salin **seluruh** isinya, tempel, lalu **Run**. Bila muncul peringatan
   *destructive operation*, pilih **Run this query**.
3. Berhasil bila tertulis *Success. No rows returned*. Bila gagal, tidak ada yang berubah (seluruh isi file berjalan
   dalam satu transaksi) — baca pesan galatnya.

- `20261019090000_alur_rekap_pencairan.sql` mengubah peran **Operator Unit → Operator Pengadaan**, mengganti tabel alur lama
  (`spp`, `sp3b`, `pengesahan`) dengan `rekap_pencairan` & `rekap_pengesahan`, dan berhenti sendiri bila tabel alur lama sudah berisi data.
- `20261019103000_peran_operator_pengesahan.sql` menambah peran **Operator Pengesahan**, menjadikan Operator Keuangan khusus
  pencairan, dan memberi Administrator izin mencairkan & mengesahkan.
- `20261019150000_sisa_anggaran_saat_pengesahan.sql` melepas batas sisa anggaran saat mencatat/mengubah belanja, memasang
  pemeriksaan sisa anggaran per MAK di `buat_rekap_pengesahan`, dan menambah RPC baca `cek_anggaran_pengesahan`.
- `20261019160000_peran_baru_tanpa_unit.sql` mengganti nama **Operator Keuangan → Operator Pencairan**, menghapus peran
  PPSPM & Bendahara Pengeluaran (akun yang masih memakainya dialihkan ke Manajemen), menambah **Pejabat Pengadaan** dan
  **Manajemen**, membatasi Operator Pencairan & Operator Pengesahan **satu akun aktif**, dan mengosongkan unit kerja pengguna.
  File ini berhenti sendiri (tanpa mengubah apa pun) bila sudah ada dua akun aktif untuk salah satu peran tersebut.

### Langkah pertama (sekali saja, di dashboard Supabase)

1. **Buat akun Administrator pertama** — *Authentication → Users → Add user → Create new user*.
   Isi email & kata sandi, **centang _Auto Confirm User_**, lalu *Create user*.
   Akun pertama otomatis menjadi **Administrator**. Nama awal diambil dari email; ubah di modul **Pengguna**.
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
| Peran | Jumlah akun | Modul yang terbuka | Yang bisa dilakukan |
|---|---|---|---|
| Operator Pengadaan | boleh banyak | Dashboard, Belanja, Aktivitas, Referensi | Catat dokumen belanja untuk **unit kerja mana pun**; ubah & hapus dokumen catatannya sendiri selama belum dicairkan; **upload FA Detail**; melihat aktivitas semua dokumen belanja |
| Operator Pencairan | **1 akun aktif** | Semua kecuali Pengguna | **Pencairan**: centang kegiatan → Cairkan; batalkan rekap pencairan |
| Operator Pengesahan | **1 akun aktif** | Semua kecuali Pengguna | **Pengesahan**: centang kegiatan yang sudah dicairkan → Sahkan; batalkan rekap pengesahan |
| Pejabat Pengadaan | boleh banyak | Semua kecuali Pengguna | Memantau dokumen belanja, pencairan, pengesahan, dan riwayat aktivitas (hanya melihat) |
| PPK | boleh banyak | Semua kecuali Pengguna | Memantau (hanya melihat); nama PPK dipilih sebagai penanda tangan saat mencetak lembar dokumen belanja |
| Manajemen | boleh banyak | Semua kecuali Pengguna | Memantau (hanya melihat) |
| Administrator | boleh banyak (minimal 1) | Semua modul | Kelola pengguna & referensi, catat dokumen belanja, pencairan **dan** pengesahan, **upload FA Detail** |

- Pengguna hanya dibedakan menurut **peran**; akun pengguna **tidak terikat unit kerja** (unit kerja tetap diisi pada dokumen belanja).
- Akun aktif kedua untuk Operator Pencairan / Operator Pengesahan ditolak (form Pengguna menandai peran yang sudah dipakai;
  database juga menolak). Untuk mengganti operator, nonaktifkan atau ubah peran akun lama lebih dulu.

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
| `/belanja`    | Catat dokumen belanja (bagian pengadaan; nilai berformat *5.000.000* + terbilang, tidak dibatasi sisa anggaran); status **Belum dicairkan → Dicairkan → Disahkan** beserta nomor rekapnya; filter status, dana, "Catatan saya"; edit/hapus oleh pencatat; cetak lembar dokumen belanja |
| `/aktivitas`  | Riwayat aktivitas (jejak audit): siapa, kapan, dokumen apa, apa yang berubah; lacak dokumen (BLJ-…) atau rekap (CAIR-… / SAH-…); ekspor CSV |
| `/pencairan`  | **Daftar** berceklist (tab Semua / RM / BLU) → **Cairkan**; **Riwayat Pencairan** berupa tabel rekapan → *Lihat daftar* kegiatan yang sudah dicairkan (status pengesahan, batal rekap) |
| `/pengesahan` | **Daftar** kegiatan yang sudah dicairkan (berceklist) → **Sahkan** (cek *Sisa anggaran per MAK*, terkunci bila kurang); **Riwayat Pengesahan** berupa tabel rekapan → *Lihat daftar* kegiatan yang sudah disahkan (batal rekap) |
| `/referensi`  | Akun belanja, unit kerja, penyedia, sumber dana (tambah & ubah oleh Administrator) |
| `/pengguna`   | Kelola pengguna, peran, status, atur ulang kata sandi (khusus Administrator) |

Nomor dibuat database: dokumen belanja `BLJ-2026-0001`, rekap pencairan `CAIR-2026-0001`, rekap pengesahan `SAH-2026-0001`
(tahun rekap mengikuti tanggal pencairan/pengesahan). Nomor tidak dipakai ulang walau dokumennya dihapus atau rekapnya dibatalkan.

### Kertas Kerja POK & upload FA Detail

Di Dashboard, klik judul tabel **Kegiatan Belanja** lalu pilih **Kertas Kerja POK**.

- **Kolom:** Uraian Kegiatan (uraian item + sub komponen), Kode MAK, Akun, Sumber Dana, Pagu, Realisasi (+ % serapan), Sisa Anggaran.
- **Sumber dana dari kode akun:** 525xxx (Barang BLU) dan 537xxx (Modal BLU) = **BLU**, akun lainnya = **RM**.
- **Sisa anggaran** = pagu − lock pagu − realisasi s.d. periode (sama dengan kolom SISA ANGGARAN di SAKTI).
- Tabel dibagi per halaman, **30 baris per halaman**. Warna sumber dana: **RM gelap**, **BLU oranye**.

**Upload FA Detail** (Administrator & Operator Pengadaan): unduh dari SAKTI *Laporan Realisasi SP2D — FA Detail 16 Segmen*
per Program sampai **Item** (atau sampai Akun) dalam format **Excel (.xlsx)**, klik **Upload FA Detail**, pilih / seret filenya.
Aplikasi menampilkan ringkasan dan hasil validasi (total dicocokkan dengan baris **JUMLAH SELURUHNYA**, jumlah item dengan nilai akun,
kode satker 287494). Setelah **Terapkan data**:

- file asli disimpan di Storage `fa-detail`, isinya disimpan di tabel `pok_*`, dan menjadi **POK aktif** untuk tahunnya
  (unggahan lama tetap tersimpan sebagai riwayat);
- kartu **Pagu Belanja**, tabel Kertas Kerja POK, daftar MAK di form catat belanja, dan sisa anggaran saat pengesahan langsung
  memakai data baru untuk semua pengguna; unggahan tercatat di riwayat aktivitas.

### Cara angka di kartu dihitung

- **Pagu Belanja (RM + BLU)** = jumlah pagu, lock, dan realisasi per jenis belanja (51 Pegawai, 52 Barang, 53 Modal) dari FA Detail aktif.
- **Kartu BLU & RM**: pagu dari FA Detail aktif; **Nilai Pencairan** = belanja yang sudah dicairkan tetapi belum disahkan;
  **Nilai Pengesahan** = belanja yang sudah disahkan; **Total Belanja** = Nilai Pencairan + Nilai Pengesahan (persen dari pagu);
  **Total Kegiatan** = jumlah dokumen belanja dana tersebut.

## Database

| Objek | Isi |
|---|---|
| `izin_peran` | Matriks izin per peran (sama dengan `lib/akses.ts`) |
| `unit_kerja`, `sumber_dana`, `akun`, `penyedia` | Referensi |
| `pengguna` | Profil pengguna, tertaut ke akun Supabase Auth (`auth_id`) |
| `pengajuan` | Dokumen belanja (kolom `pencairan_nomor`, `pengesahan_nomor` menunjuk rekapnya) |
| `rekap_pencairan`, `rekap_pengesahan` | Rekap berceklist: tanggal, sumber dana, jenis pembayaran (pencairan), No. referensi, jumlah & total |
| view `v_pengajuan` | Dokumen belanja + status (*Belum dicairkan / Dicairkan / Disahkan*) yang dihitung dari rekapnya |
| `aktivitas` | Riwayat aktivitas (hanya bertambah) |
| `pok_unggahan`, `pok_uraian`, `pok_mak`, `pok_item` | Kertas Kerja POK dari FA Detail |
| Skema `app` | Fungsi bantu & penghitung nomor dokumen (tidak terbuka lewat API) |

Fungsi RPC yang dipanggil aplikasi: `buat_pengajuan`, `ubah_pengajuan`, `hapus_pengajuan`, `buat_rekap_pencairan`,
`batal_rekap_pencairan`, `buat_rekap_pengesahan`, `batal_rekap_pengesahan`, `cek_anggaran_pengesahan`, `catat_aktivitas`,
`jejak_dokumen`, `simpan_referensi`, `terapkan_pok`, `pok_aktif`. Fungsi `admin_*` hanya bisa dipanggil API server (service role).

> **Security Advisor** Supabase menampilkan peringatan *"Signed-In Users Can Execute SECURITY DEFINER Function"* untuk fungsi RPC di atas.
> Ini disengaja: fungsi-fungsi itulah satu-satunya jalan mengubah data, dan setiap fungsi memeriksa peran & status di dalamnya.
> Pengguna yang belum login (anon) tidak punya akses ke tabel maupun fungsi apa pun.

### Memasang di project Supabase baru (mis. untuk uji coba)

1. Buat project baru di Supabase.
2. Buka **SQL Editor**, jalankan berurutan isi file: `supabase/migrations/20261018210500_belanjaku_skema.sql`,
   `supabase/migrations/20261019090000_alur_rekap_pencairan.sql`, `supabase/migrations/20261019103000_peran_operator_pengesahan.sql`,
   `supabase/seed/01_referensi.sql`,
   lalu `supabase/seed/02_pok_oktober_2026.sql`.
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
│   ├── RekapBelanja.tsx    # daftar berceklist + riwayat rekap (dipakai Pencairan & Pengesahan)
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
| *"Database belum diperbarui ke versi aplikasi ini"* | Migrasi terbaru belum dijalankan di Supabase. Jalankan file migrasi yang belum ada (urut nama file) di SQL Editor. |
| Kotak centang / tombol **Cairkan** tidak muncul | Peran Anda hanya melihat. Pencairan: Operator Pencairan, Administrator. |
| Kotak centang / tombol **Sahkan** tidak muncul | Pengesahan: Operator Pengesahan, Administrator. |
| *"Peran … hanya boleh satu akun aktif"* | Operator Pencairan / Operator Pengesahan sudah dipegang akun lain. Nonaktifkan atau ubah peran akun itu dulu. |
