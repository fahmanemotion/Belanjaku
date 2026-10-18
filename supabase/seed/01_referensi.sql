-- =====================================================================
-- DATA AWAL REFERENSI BELANJAKU
-- Jalankan sekali setelah migrasi skema. Aman dijalankan ulang (ON CONFLICT DO NOTHING).
-- Unit kerja & penyedia dapat diubah/ditambah Administrator di modul Referensi.
-- =====================================================================
insert into public.sumber_dana (kode, nama, warna) values
  ('RM', 'Rupiah Murni', '#141416'),
  ('BLU', 'PNBP BLU', '#f05a1a'),
  ('HBH', 'Hibah', '#9b9ba4')
on conflict (kode) do nothing;

insert into public.unit_kerja (kode, nama, penanggung_jawab) values
  ('UK01', 'Bagian Administrasi Umum dan Keuangan', 'Kabag AUK'),
  ('UK02', 'Bagian Administrasi Akademik dan Ketarunaan', 'Kabag AAK'),
  ('UK03', 'Program Studi Nautika', 'Ketua Prodi'),
  ('UK04', 'Program Studi Teknika', 'Ketua Prodi'),
  ('UK05', 'Program Studi KALK', 'Ketua Prodi'),
  ('UK06', 'Unit Diklat Keterampilan Khusus', 'Kepala Unit'),
  ('UK07', 'Unit Laboratorium dan Simulator', 'Kepala Unit'),
  ('UK08', 'Unit Penjaminan Mutu', 'Kepala Unit')
on conflict (kode) do nothing;

-- Penerima pembayaran umum; penyedia barang/jasa ditambahkan Administrator di modul Referensi
insert into public.penyedia (nama, bidang, kota) values
  ('Narasumber perorangan', 'Honor narasumber', '—'),
  ('Daftar nominatif pegawai', 'Pembayaran hak pegawai', '—')
on conflict do nothing;

-- Akun belanja sesuai DIPA 2026 (dari FA Detail SAKTI)
insert into public.akun (kode, uraian) values
  ('511111', 'Belanja Gaji Pokok PNS'),
  ('511119', 'Belanja Pembulatan Gaji PNS'),
  ('511121', 'Belanja Tunj. Suami/Istri PNS'),
  ('511122', 'Belanja Tunj. Anak PNS'),
  ('511123', 'Belanja Tunj. Struktural PNS'),
  ('511124', 'Belanja Tunj. Fungsional PNS'),
  ('511125', 'Belanja Tunj. PPh PNS'),
  ('511126', 'Belanja Tunj. Beras PNS'),
  ('511129', 'Belanja Uang Makan PNS'),
  ('511151', 'Belanja Tunjangan Umum PNS'),
  ('511153', 'Belanja Tunjangan Profesi Dosen'),
  ('511611', 'Belanja Gaji Pokok PPPK'),
  ('511619', 'Belanja Pembulatan Gaji PPPK'),
  ('511621', 'Belanja Tunjangan Suami/Istri PPPK'),
  ('511622', 'Belanja Tunjangan Anak PPPK'),
  ('511624', 'Belanja Tunjangan Fungsional PPPK'),
  ('511625', 'Belanja Tunjangan Beras PPPK'),
  ('511628', 'Belanja Uang Makan PPPK'),
  ('511633', 'Belanja Tunjangan Umum PPPK'),
  ('512211', 'Belanja Uang Lembur'),
  ('521111', 'Belanja Keperluan Perkantoran'),
  ('521115', 'Belanja Honor Operasional Satuan Kerja'),
  ('521211', 'Belanja Bahan'),
  ('521213', 'Belanja Honor Output Kegiatan'),
  ('521219', 'Belanja Barang Non Operasional Lainnya'),
  ('521811', 'Belanja Barang Persediaan Barang Konsumsi'),
  ('522111', 'Belanja Langganan Listrik'),
  ('522119', 'Belanja Langganan Daya dan Jasa Lainnya'),
  ('522151', 'Belanja Jasa Profesi'),
  ('522191', 'Belanja Jasa Lainnya'),
  ('523111', 'Belanja Pemeliharaan Gedung dan Bangunan'),
  ('523121', 'Belanja Pemeliharaan Peralatan dan Mesin'),
  ('525111', 'Belanja Gaji dan Tunjangan'),
  ('525112', 'Belanja Barang'),
  ('525113', 'Belanja Jasa'),
  ('525114', 'Belanja Pemeliharaan'),
  ('525115', 'Belanja Perjalanan'),
  ('525121', 'Belanja Barang Persediaan Barang Konsumsi - BLU'),
  ('525129', 'Belanja Barang Persediaan Lainnya - BLU'),
  ('537112', 'Belanja Modal Peralatan dan Mesin - BLU'),
  ('537113', 'Belanja Modal Gedung dan Bangunan - BLU')
on conflict (kode) do nothing;
