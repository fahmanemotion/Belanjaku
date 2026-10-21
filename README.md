# Belanjaku — PIP Makassar

Aplikasi pengelolaan belanja Politeknik Ilmu Pelayaran Makassar (Satker 287494).

- **Aplikasi:** Next.js 16 (App Router) + React 19 + TypeScript, tanpa library UI tambahan.
- **Database & login:** Supabase (PostgreSQL, Auth, Storage, Realtime).
- **Hosting:** Vercel (region fungsi `sin1` Singapura, dekat dengan database di `ap-southeast-1`).

> Semua data tersimpan di database: paket pengadaan (Nota Dinas s.d. BAST), dokumen belanja, rekap pencairan & pengesahan, pengguna, referensi,
> riwayat aktivitas, Kertas Kerja POK, kartu **Pagu Belanja** (dari FA Detail yang diunggah), dan kartu **BLU & RM**
> (dari rekap pencairan & pengesahan). Yang **masih data contoh** dan diberi label *Data contoh*: grafik
> Target vs Realisasi dan panel Target per Jenis Belanja (lihat `lib/data.ts`).

## Alur dokumen

```
Pengadaan (alur Kwitansi)
PPK: Nota Dinas & HPS ─▶ Pejabat Pengadaan: Surat Pesanan ─▶ Nota Pembelian ─▶ PPK: Kwitansi, BAP & BAST ─┐
                                                                                                          │ otomatis
Belanja                         Pencairan                            Pengesahan                           ▼
(Operator Pengadaan)            (Operator Pencairan)                 (Operator Pengesahan)        dokumen belanja Kwitansi
catat kegiatan          ──▶     Daftar: centang → Cairkan     ──▶    Daftar: centang → Sahkan
                                Riwayat Pencairan                    Riwayat Pengesahan
status: Belum dicairkan         status: Dicairkan (CAIR-2026-…)      status: Disahkan (SAH-2026-…)
```

0. **Pengadaan** — alur dokumen Kwitansi dari Nota Dinas sampai BAST (lihat *Pengadaan: alur dokumen Kwitansi* di bawah).
   Saat PPK menerbitkan Kwitansi, BAP & BAST, kwitansinya **otomatis menjadi dokumen belanja** jenis Kwitansi di Daftar Pencairan.
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

### Pengadaan: alur dokumen Kwitansi

Mengikuti berkas `NODIN_KWITANSI.xlsx` (sheet pertama s.d. terakhir). Satu **paket** (`PKT-2026-0001`) berjalan 4 tahap:

| Tahap | Pelaku | Isian | Dokumen tercetak |
|---|---|---|---|
| 1. Nota Dinas & HPS | **PPK** | Pekerjaan, unit kerja, sumber dana, MAK, nomor & tanggal Nota Dinas, daftar barang/jasa (uraian, spesifikasi per baris, jumlah, satuan, harga satuan HPS, keterangan), PPN 11% | Nota Dinas *Perintah Pengadaan Barang/Jasa*, HPS (*Daftar Paket Pekerjaan*) |
| 2. Surat Pesanan | **Pejabat Pengadaan** | Penyedia (pilih dari Referensi atau tambah baru) + data pembayarannya, nomor & tanggal SP, batas waktu (hari) | Surat Pesanan |
| 3. Nota Pembelian | **Pejabat Pengadaan** | Tanggal nota, harga satuan pembelian per barang (bawaan = HPS; total tidak boleh melebihi HPS), PPN 11% | Nota / Bukti Pembelian |
| 4. Kwitansi, BAP & BAST | **PPK** | Nomor & tanggal Kwitansi, BAP, BAST; tanda √ kolom *MEMENUHI* di Lampiran BAP | Kwitansi + Lampiran, BAP + Lampiran, BAST + Lampiran |

- **Nomor dokumen** mengikuti pola berkas Excel; cukup isi bagian tengahnya, bulan (Romawi) dan tahun mengikuti tanggal dokumen:
  Nota Dinas & Kwitansi `PL.102/PPK/KO-RM/[100142]/X/PIP.MKS-2026`, Surat Pesanan `PL.102/PP/KO-RM/[100143]/X/PIP.MKS-2026`,
  BAP `PL.102/PPK-RM/BAP/[KODE-PAKET]/X/2026`, BAST `PL.102/PPK-RM/BAST/[KODE-PAKET]/X/PIP.MKS-2026`. Nomor yang polanya lain
  bisa ditulis lengkap (*Tulis nomor lengkap*). Nomor lengkap yang ditempel ke kolom tengah dikenali: bila polanya cocok
  hanya bagian tengahnya yang dipakai, bila tidak cocok isian beralih ke *Tulis nomor lengkap*.
- **Terbilang** (*… Rupiah.*), hari & tanggal dalam huruf di BAP/BAST (*Kamis tanggal Delapan Bulan Oktober Tahun Dua Ribu Dua Puluh Enam*),
  dan PPN 11% dihitung otomatis (PPN dibulatkan ke rupiah terdekat).
- **Penanda tangan**: PPK paket (yang menerbitkan Nota Dinas) dan Pejabat Pengadaan yang menerbitkan Surat Pesanan. NIP, pangkat/golongan,
  serta nomor & tanggal **SK penunjukan PPK** (dicetak di BAP) diisi Administrator di modul **Pengguna** atau oleh pejabatnya sendiri lewat
  tombol **Data penanda tangan** di modul Pengadaan. Isian yang kosong tercetak titik-titik.
- **Data penyedia** (pimpinan, jabatan, alamat, NPWP, bank, rekening) wajib lengkap saat Surat Pesanan; perubahannya ikut tersimpan di Referensi.
  Saat kwitansi terbit, data penyedia & pejabat **disalin ke paket** sehingga cetakan ulang tetap sama walau referensi berubah.
- **Ubah & batal**: satu tahap bisa diubah pelakunya selama tahap berikutnya belum terbit. Tahap terakhir bisa **dibatalkan** (wajib alasan)
  agar tahap sebelumnya bisa diperbaiki; isiannya tetap tersimpan untuk diterbitkan ulang. Membatalkan kwitansi mengeluarkan dokumen
  belanjanya dari Daftar Pencairan. Kwitansi yang **sudah dicairkan** tidak bisa diubah atau dibatalkan. Paket hanya bisa **dihapus**
  selama masih di tahap Nota Dinas.
- Dokumen belanja hasil paket hanya diubah lewat modul Pengadaan (di modul Belanja tombol ubah/hapusnya terkunci dan diberi label *dari paket PKT-…*).
- Administrator boleh menjalankan semua tahap (memilih PPK / Pejabat Pengadaan penanda tangan). Peran lain hanya melihat dan mencetak.
- **Cetak**: tombol cetak pada tiap tahap atau *Cetak semua* di rincian paket; pilih dokumen di bar atas pratinjau. Kertas A4, satu dokumen per
  halaman. Di jendela cetak browser pilih ukuran **A4**, skala **100% / Default**, dan margin **Default**. Di Chrome & Edge
  tanggal, judul, dan alamat web dari browser otomatis tidak ikut tercetak (halaman pertama dicetak tanpa margin atas/bawah
  browser, jaraknya diganti padding lembar); di Safari / Firefox matikan **Header dan footer** di jendela cetak.
  Kop surat & logo kaki halaman **tertanam di kode** (`lib/gambarDokumen.ts`, data URI) sehingga tidak ada file gambar
  terpisah yang perlu diunggah; motto kaki halaman memakai huruf *Brush Script MT* (tersedia di Windows & macOS).

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
| Mengubah data | **Hanya lewat fungsi RPC di database** (`simpan_nota_dinas`, `simpan_kwitansi`, `buat_pengajuan`, `buat_rekap_pencairan`, `buat_rekap_pengesahan`, dst.). Setiap fungsi memeriksa peran, pencatat dokumen, status, sumber dana, dan (saat pengesahan) sisa anggaran MAK, lalu mencatat riwayat aktivitas dalam satu transaksi. Browser tidak bisa INSERT/UPDATE/DELETE langsung. |
| Kelola akun | Tambah/ubah/hapus pengguna dan atur ulang kata sandi lewat API server Next.js (`app/api/pengguna/…`) memakai *secret key*. Pemanggil diperiksa: harus Administrator aktif. |
| File FA Detail | File asli `.xlsx` disimpan di Storage bucket privat **`fa-detail`**. |
| Realtime | Perubahan oleh pengguna lain langsung tampil tanpa refresh. |

## Project Supabase yang sudah terpasang

| | |
|---|---|
| Project | `belanjaku-pip` (ref `qqoltdrwlbeaeyjerszk`), region Singapore |
| URL | `https://qqoltdrwlbeaeyjerszk.supabase.co` |
| Skema | 1. `supabase/migrations/20261018210500_belanjaku_skema.sql` — **sudah dijalankan**<br>2. `supabase/migrations/20261019090000_alur_rekap_pencairan.sql` — alur rekap pencairan & pengesahan — **sudah dijalankan**<br>3. `supabase/migrations/20261019103000_peran_operator_pengesahan.sql` — peran Operator Pengesahan — **sudah dijalankan**<br>4. `supabase/migrations/20261019150000_sisa_anggaran_saat_pengesahan.sql` — sisa anggaran diperiksa saat pengesahan — **jalankan sekali** (belum masuk produksi; ditempel lewat langkah v23)<br>5. `supabase/migrations/20261019160000_peran_baru_tanpa_unit.sql` — susunan peran baru, pengguna tanpa unit kerja — **sudah dijalankan**<br>6. `supabase/migrations/20261020090000_pengadaan_kwitansi.sql` — modul Pengadaan (alur dokumen Kwitansi) — **sudah dijalankan**<br>(4 aman dijalankan setelah 6 karena keduanya tidak mengubah fungsi yang sama — lihat *Memperbarui database*) |
| Data awal | `supabase/seed/01_referensi.sql` (3 sumber dana, 8 unit kerja, 2 penyedia, 41 akun) dan `supabase/seed/02_pok_oktober_2026.sql` (FA Detail Oktober 2026: 462 MAK, 1.159 item, pagu Rp354.354.344.000) — **sudah dijalankan** |

### Memperbarui database (migrasi baru)

Setiap file baru di `supabase/migrations/` dijalankan **sekali**, berurutan menurut nama file, **sebelum** kode versi
barunya di-push:

1. Dashboard Supabase → **SQL Editor** → *New query*.
2. Buka file migrasinya di VS Code, salin **seluruh** isinya, tempel, lalu **Run**. Bila muncul peringatan
   *destructive operation*, pilih **Run this query**. Dari Terminal Mac bisa juga `cat <file migrasi> | pbcopy` lalu
   `open <alamat SQL Editor>`; jangan menyalin teks lain (termasuk alamat SQL Editor) sebelum menempel, karena isi
   clipboard akan tertimpa.
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
- `20261020090000_pengadaan_kwitansi.sql` menambah modul **Pengadaan**: tabel `paket_pengadaan` + view `v_paket`, izin
  `pengadaan.ppk` (PPK, Administrator) & `pengadaan.pp` (Pejabat Pengadaan, Administrator), kolom data penanda tangan di `pengguna`
  (NIP, pangkat, SK) dan data pembayaran di `penyedia` (alamat, pimpinan, jabatan, NPWP, bank, rekening), RPC tiap tahap, serta
  memperbaiki pencatatan aktivitas *cetak lembar belanja*. Aman dijalankan ulang.

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

| Peran | Jumlah akun | Modul yang terbuka | Yang bisa dilakukan |
|---|---|---|---|
| PPK | boleh banyak | Semua kecuali Pengguna | **Pengadaan**: terbitkan Nota Dinas & HPS, lalu Kwitansi, BAP & BAST untuk paketnya (ubah, batalkan, hapus sesuai tahap); selebihnya memantau |
| Pejabat Pengadaan | boleh banyak | Semua kecuali Pengguna | **Pengadaan**: terbitkan Surat Pesanan (memilih / menambah penyedia) dan catat Nota Pembelian; selebihnya memantau |
| Operator Pengadaan | boleh banyak | Dashboard, Pengadaan, Belanja, Aktivitas, Referensi | Catat dokumen belanja untuk **unit kerja mana pun**; ubah & hapus dokumen catatannya sendiri selama belum dicairkan; **upload FA Detail**; melihat aktivitas semua dokumen belanja & pengadaan |
| Operator Pencairan | **1 akun aktif** | Semua kecuali Pengguna | **Pencairan**: centang kegiatan → Cairkan; batalkan rekap pencairan |
| Operator Pengesahan | **1 akun aktif** | Semua kecuali Pengguna | **Pengesahan**: centang kegiatan yang sudah dicairkan → Sahkan; batalkan rekap pengesahan |
| Manajemen | boleh banyak | Semua kecuali Pengguna | Memantau & mencetak (hanya melihat) |
| Administrator | boleh banyak (minimal 1) | Semua modul | Kelola pengguna & referensi, semua tahap pengadaan, catat dokumen belanja, pencairan **dan** pengesahan, **upload FA Detail** |

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
| `/pengadaan`  | Alur dokumen Kwitansi: kartu 4 tahap, daftar paket (filter tahap, dana, *Perlu tindakan saya*), rincian paket per tahap, form tiap tahap, cetak 10 dokumen sesuai format Excel |
| `/dashboard`  | Pagu & jenis belanja dari FA Detail (filter **Gabung / RM / BLU**), kartu BLU & RM, grafik Target vs Realisasi, target per jenis belanja, tabel **Kegiatan Belanja / Kertas Kerja POK** (pilih lewat judul tabel) |
| `/belanja`    | Catat dokumen belanja (bagian pengadaan; nilai berformat *5.000.000* + terbilang, tidak dibatasi sisa anggaran); status **Belum dicairkan → Dicairkan → Disahkan** beserta nomor rekapnya; filter status, dana, "Catatan saya"; edit/hapus oleh pencatat; cetak lembar dokumen belanja |
| `/aktivitas`  | Riwayat aktivitas (jejak audit): siapa, kapan, dokumen apa, apa yang berubah; lacak paket (PKT-…), dokumen (BLJ-…), atau rekap (CAIR-… / SAH-…); ekspor CSV |
| `/pencairan`  | **Daftar** berceklist (tab Semua / RM / BLU) → **Cairkan**; **Riwayat Pencairan** berupa tabel rekapan → *Lihat daftar* kegiatan yang sudah dicairkan (status pengesahan, batal rekap) |
| `/pengesahan` | **Daftar** kegiatan yang sudah dicairkan (berceklist) → **Sahkan** (cek *Sisa anggaran per MAK*, terkunci bila kurang); **Riwayat Pengesahan** berupa tabel rekapan → *Lihat daftar* kegiatan yang sudah disahkan (batal rekap) |
| `/referensi`  | Akun belanja, unit kerja, penyedia (termasuk pimpinan, alamat, NPWP, bank, rekening), sumber dana (tambah & ubah oleh Administrator) |
| `/pengguna`   | Kelola pengguna, peran, status, data penanda tangan PPK & Pejabat Pengadaan (NIP, pangkat, SK), atur ulang kata sandi (khusus Administrator) |

Nomor dibuat database: paket pengadaan `PKT-2026-0001` (tahun mengikuti tanggal Nota Dinas), dokumen belanja `BLJ-2026-0001`,
rekap pencairan `CAIR-2026-0001`, rekap pengesahan `SAH-2026-0001` (tahun rekap mengikuti tanggal pencairan/pengesahan). Nomor tidak dipakai ulang walau dokumennya dihapus atau rekapnya dibatalkan.

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
| `unit_kerja`, `sumber_dana`, `akun`, `penyedia` | Referensi (penyedia termasuk data pembayaran untuk dokumen pengadaan) |
| `pengguna` | Profil pengguna, tertaut ke akun Supabase Auth (`auth_id`); NIP, pangkat, SK untuk penanda tangan |
| `paket_pengadaan`, view `v_paket` | Paket pengadaan alur Kwitansi: tahap 1–4, daftar barang (JSON), nomor & tanggal tiap dokumen, PPK, Pejabat Pengadaan, penyedia, salinan data cetak (`arsip`), dokumen belanja hasil kwitansi (`pengajuan_id`) |
| `pengajuan` | Dokumen belanja (kolom `pencairan_nomor`, `pengesahan_nomor` menunjuk rekapnya) |
| `rekap_pencairan`, `rekap_pengesahan` | Rekap berceklist: tanggal, sumber dana, jenis pembayaran (pencairan), No. referensi, jumlah & total |
| view `v_pengajuan` | Dokumen belanja + status (*Belum dicairkan / Dicairkan / Disahkan*) yang dihitung dari rekapnya + nomor paket asal (`paket_id`) |
| `aktivitas` | Riwayat aktivitas (hanya bertambah) |
| `pok_unggahan`, `pok_uraian`, `pok_mak`, `pok_item` | Kertas Kerja POK dari FA Detail |
| Skema `app` | Fungsi bantu & penghitung nomor dokumen (tidak terbuka lewat API) |

Fungsi RPC yang dipanggil aplikasi: `simpan_nota_dinas`, `simpan_pesanan`, `simpan_pembelian`, `simpan_kwitansi`,
`batal_tahap_paket`, `hapus_paket`, `simpan_data_pejabat`, `buat_pengajuan`, `ubah_pengajuan`, `hapus_pengajuan`, `buat_rekap_pencairan`,
`batal_rekap_pencairan`, `buat_rekap_pengesahan`, `batal_rekap_pengesahan`, `cek_anggaran_pengesahan`, `catat_aktivitas`,
`jejak_dokumen`, `simpan_referensi`, `terapkan_pok`, `pok_aktif`. Fungsi `admin_*` hanya bisa dipanggil API server (service role).

> **Security Advisor** Supabase menampilkan peringatan *"Signed-In Users Can Execute SECURITY DEFINER Function"* untuk fungsi RPC di atas.
> Ini disengaja: fungsi-fungsi itulah satu-satunya jalan mengubah data, dan setiap fungsi memeriksa peran & status di dalamnya.
> Pengguna yang belum login (anon) tidak punya akses ke tabel maupun fungsi apa pun.

### Memasang di project Supabase baru (mis. untuk uji coba)

1. Buat project baru di Supabase.
2. Buka **SQL Editor**, jalankan berurutan isi seluruh file di `supabase/migrations/` (urut nama file:
   `20261018210500…`, `20261019090000…`, `20261019103000…`, `20261019150000…`, `20261019160000…`, `20261020090000…`),
   lalu `supabase/seed/01_referensi.sql` dan `supabase/seed/02_pok_oktober_2026.sql`.
3. Ikuti *Langkah pertama* di atas, lalu isi variabel lingkungan dengan URL & kunci project baru.

`supabase/rollback/20261018210500_belanjaku_skema_down.sql` menghapus seluruh skema **beserta semua datanya** — hanya untuk uji coba.

## Struktur folder

```
belanjaku-pip/
├── app/
│   ├── layout.tsx          # root layout: font, tema, StoreProvider, AppShell
│   ├── globals.css         # seluruh styling (token warna terang & gelap)
│   ├── page.tsx            # redirect ke /dashboard
│   ├── <modul>/page.tsx    # dashboard, pengadaan, belanja, aktivitas, pencairan, pengesahan, referensi, pengguna
│   └── api/pengguna/       # API server kelola akun (route.ts, [id]/route.ts, [id]/sandi/route.ts)
├── components/
│   ├── AppShell.tsx        # rail ikon + navigasi + menu akun; Login bila belum masuk
│   ├── Login.tsx           # halaman masuk (Supabase Auth)
│   ├── GantiSandi.tsx      # ganti kata sandi sendiri
│   ├── StoreProvider.tsx   # sesi, data dari Supabase, realtime, aksi (RPC), hak akses, toast
│   ├── RekapBelanja.tsx    # daftar berceklist + riwayat rekap (dipakai Pencairan & Pengesahan)
│   ├── CetakPengadaan.tsx  # 10 dokumen pengadaan A4 (format berkas Excel NODIN_KWITANSI)
│   ├── InputNomor.tsx      # isian nomor dokumen berpola (PL.102/…)
│   ├── Combobox.tsx, CetakKegiatan.tsx, UnggahFaDetail.tsx, KolomKegiatan.tsx, Icon.tsx, Logo.tsx, ui.tsx
│   └── modules/            # satu file per modul
├── lib/
│   ├── supabase.ts         # klien Supabase di browser (publishable key)
│   ├── supabaseServer.ts   # klien server (secret key) + pemeriksaan Administrator untuk API
│   ├── db.ts               # pemuat data & pemetaan baris database → tipe aplikasi
│   ├── akses.ts            # HAK AKSES per peran (modul & izin)
│   ├── mak.ts              # tipe & penyusun data MAK / Kertas Kerja POK
│   ├── faDetail.ts         # pembaca file FA Detail (.xlsx) SAKTI di browser + validasi
│   ├── pengadaan.ts        # tahap, jumlah & PPN, terbilang, tanggal dalam huruf, pola nomor dokumen pengadaan
│   ├── gambarDokumen.ts    # kop surat & logo kaki halaman dokumen pengadaan (KAN, SGS) sebagai data URI
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
| Tombol **Terbitkan / Catat** di Pengadaan tidak muncul | Tahap paket bukan giliran peran Anda, atau paket milik PPK / Pejabat Pengadaan lain. Nota Dinas & Kwitansi: PPK paket itu; Surat Pesanan & Nota Pembelian: Pejabat Pengadaan (Administrator boleh semua). |
| *"Nota dinas … tidak bisa diubah karena Surat Pesanan sudah terbit"* | Minta Pejabat Pengadaan **membatalkan** Surat Pesanan (isiannya tetap tersimpan), perbaiki Nota Dinas, lalu SP diterbitkan ulang. |
| Hasil cetak dokumen mengecil, terpotong, atau ada tanggal/alamat web di tepi kertas | Di jendela cetak: kertas **A4**, skala **100% / Default**, margin **Default** (bukan *Minimum*/*Kustom*). Chrome & Edge tidak mencetak tanggal/URL bila margin Default; di Safari / Firefox matikan **Header dan footer**. |
| NIP / SK tercetak titik-titik | Data penanda tangan belum diisi: modul Pengguna (Administrator) atau tombol **Data penanda tangan** di Pengadaan. |
| Kop surat / logo tidak tampil atau tampil sebagai ikon rusak | Sejak v23 gambar tertanam di `lib/gambarDokumen.ts`. Pastikan file itu ikut ter-push dan deploy Vercel terbaru sudah selesai, lalu muat ulang halaman (⌘⇧R). |
