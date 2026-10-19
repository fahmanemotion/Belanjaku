-- =====================================================================
-- BELANJAKU — pembagian tugas rekap pencairan & pengesahan
--
-- • Operator Keuangan   : mencentang belanja lalu mencairkan (rekap pencairan)
-- • Operator Pengesahan : PERAN BARU — mencentang belanja yang sudah dicairkan lalu mengesahkan (rekap pengesahan)
-- • Bendahara Pengeluaran & Administrator : boleh keduanya
--
-- Jalankan sekali setelah 20261019090000_alur_rekap_pencairan.sql.
-- =====================================================================

-- Daftar peran yang diizinkan
alter table public.izin_peran drop constraint if exists izin_peran_peran_check;
alter table public.pengguna drop constraint if exists pengguna_peran_check;
alter table public.izin_peran add constraint izin_peran_peran_check
  check (peran in ('Administrator', 'Operator Pengadaan', 'Operator Keuangan', 'Operator Pengesahan', 'Bendahara Pengeluaran', 'PPK', 'PPSPM'));
alter table public.pengguna add constraint pengguna_peran_check
  check (peran in ('Administrator', 'Operator Pengadaan', 'Operator Keuangan', 'Operator Pengesahan', 'Bendahara Pengeluaran', 'PPK', 'PPSPM'));

-- Operator Keuangan khusus pencairan
delete from public.izin_peran where peran = 'Operator Keuangan' and izin = 'pengesahan.sahkan';

-- Operator Pengesahan (baru) dan Administrator
insert into public.izin_peran (peran, izin) values
  ('Operator Pengesahan', 'belanja.lihatSemua'), ('Operator Pengesahan', 'pengesahan.sahkan'), ('Operator Pengesahan', 'aktivitas.semua'),
  ('Administrator', 'pencairan.rekap'), ('Administrator', 'pengesahan.sahkan')
on conflict (peran, izin) do nothing;
