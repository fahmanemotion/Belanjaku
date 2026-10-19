-- =====================================================================
-- BELANJAKU — susunan peran baru & pengguna tanpa unit kerja
--
-- Peran (7):
--   Administrator        : kelola pengguna & referensi; boleh mencatat, mencairkan, mengesahkan
--   Operator Pengadaan   : mencatat dokumen belanja            — boleh banyak akun
--   Operator Pencairan   : mencentang & mencairkan             — HANYA SATU akun aktif
--                          (sebelumnya bernama Operator Keuangan)
--   Operator Pengesahan  : mencentang & mengesahkan            — HANYA SATU akun aktif
--   Pejabat Pengadaan    : memantau                            — boleh banyak akun
--   PPK                  : memantau                            — boleh banyak akun
--   Manajemen            : memantau
-- • Peran PPSPM dan Bendahara Pengeluaran dihapus; akun yang masih memakainya dialihkan ke Manajemen.
-- • Pengguna tidak lagi terikat unit kerja: kolom pengguna.unit dikosongkan dan tidak dipakai lagi.
--   (Unit kerja tetap dipakai pada dokumen belanja.)
--
-- Jalankan sekali setelah 20261019150000_sisa_anggaran_saat_pengesahan.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Daftar peran
-- ---------------------------------------------------------------------
alter table public.izin_peran drop constraint if exists izin_peran_peran_check;
alter table public.pengguna drop constraint if exists pengguna_peran_check;

update public.pengguna set peran = 'Operator Pencairan' where peran = 'Operator Keuangan';
update public.pengguna set peran = 'Manajemen' where peran in ('PPSPM', 'Bendahara Pengeluaran');
delete from public.izin_peran;

alter table public.izin_peran add constraint izin_peran_peran_check
  check (peran in ('Administrator', 'Operator Pengadaan', 'Operator Pencairan', 'Operator Pengesahan', 'Pejabat Pengadaan', 'PPK', 'Manajemen'));
alter table public.pengguna add constraint pengguna_peran_check
  check (peran in ('Administrator', 'Operator Pengadaan', 'Operator Pencairan', 'Operator Pengesahan', 'Pejabat Pengadaan', 'PPK', 'Manajemen'));

-- Izin per peran (sama dengan lib/akses.ts)
insert into public.izin_peran (peran, izin) values
  ('Administrator', 'belanja.buat'), ('Administrator', 'belanja.lihatSemua'), ('Administrator', 'pencairan.rekap'),
  ('Administrator', 'pengesahan.sahkan'), ('Administrator', 'aktivitas.semua'), ('Administrator', 'referensi.kelola'),
  ('Administrator', 'pengguna.kelola'), ('Administrator', 'pok.unggah'),
  ('Operator Pengadaan', 'belanja.buat'), ('Operator Pengadaan', 'belanja.lihatSemua'), ('Operator Pengadaan', 'pok.unggah'),
  ('Operator Pencairan', 'belanja.lihatSemua'), ('Operator Pencairan', 'pencairan.rekap'), ('Operator Pencairan', 'aktivitas.semua'),
  ('Operator Pengesahan', 'belanja.lihatSemua'), ('Operator Pengesahan', 'pengesahan.sahkan'), ('Operator Pengesahan', 'aktivitas.semua'),
  ('Pejabat Pengadaan', 'belanja.lihatSemua'), ('Pejabat Pengadaan', 'aktivitas.semua'),
  ('PPK', 'belanja.lihatSemua'), ('PPK', 'aktivitas.semua'),
  ('Manajemen', 'belanja.lihatSemua'), ('Manajemen', 'aktivitas.semua');

-- ---------------------------------------------------------------------
-- 2. Operator Pencairan & Operator Pengesahan: hanya satu akun aktif
-- ---------------------------------------------------------------------
do $$
declare v_peran text;
begin
  select p.peran into v_peran
  from public.pengguna p
  where p.peran in ('Operator Pencairan', 'Operator Pengesahan') and p.aktif and p.deleted_at is null
  group by p.peran having count(*) > 1
  limit 1;
  if v_peran is not null then
    raise exception 'Ada lebih dari satu akun aktif berperan %. Nonaktifkan atau ubah peran akun lainnya lebih dulu, lalu jalankan ulang file ini.', v_peran;
  end if;
end $$;

create unique index if not exists pengguna_satu_akun_per_peran on public.pengguna (peran)
  where peran in ('Operator Pencairan', 'Operator Pengesahan') and aktif and deleted_at is null;

-- Pesan yang jelas sebelum indeks unik menolak
create or replace function app.periksa_satu_akun(p_peran text, p_kecuali uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
declare v_nama text;
begin
  if p_peran not in ('Operator Pencairan', 'Operator Pengesahan') then return; end if;
  select p.nama into v_nama
  from public.pengguna p
  where p.peran = p_peran and p.aktif and p.deleted_at is null and p.id is distinct from p_kecuali
  limit 1;
  if v_nama is not null then
    raise exception 'Peran % hanya boleh satu akun aktif dan saat ini dipakai %. Nonaktifkan atau ubah peran akun tersebut lebih dulu.', p_peran, v_nama;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Pengguna tanpa unit kerja
-- ---------------------------------------------------------------------
update public.pengguna set unit = null where unit is not null;

-- Akun pertama (Administrator) dibuat tanpa unit kerja
create or replace function app.pengguna_auth_baru()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.pengguna p where p.peran = 'Administrator' and p.aktif and p.deleted_at is null) then
    insert into public.pengguna (auth_id, nama, email, peran, unit, aktif)
    values (
      new.id,
      coalesce(nullif(btrim(new.raw_user_meta_data->>'nama'), ''), initcap(replace(split_part(new.email, '@', 1), '.', ' '))),
      lower(new.email),
      'Administrator',
      null,
      true
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Kelola pengguna (p_unit diabaikan; parameter dipertahankan agar pemanggil lama tetap jalan)
-- ---------------------------------------------------------------------
create or replace function public.admin_tambah_pengguna(p_aktor uuid, p_auth_id uuid, p_nama text, p_email text, p_peran text, p_unit text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin public.pengguna;
  v public.pengguna;
  v_akt jsonb;
  v_batasan text;
begin
  v_admin := app.wajib_admin(p_aktor);
  perform app.periksa_satu_akun(p_peran, null);
  insert into public.pengguna (auth_id, nama, email, peran, unit)
  values (p_auth_id, btrim(p_nama), lower(btrim(p_email)), p_peran, null)
  returning * into v;
  v_akt := app.catat(v_admin.id, 'Pengguna', 'Pengguna', 'menambah pengguna', v.id::text, v.nama, null, v.peran || ' · ' || v.email);
  return jsonb_build_object('pengguna', to_jsonb(v), 'aktivitas', jsonb_build_array(v_akt));
exception
  when unique_violation then
    get stacked diagnostics v_batasan = constraint_name;
    if v_batasan = 'pengguna_satu_akun_per_peran' then raise exception 'Peran % hanya boleh satu akun aktif', p_peran; end if;
    raise exception 'Email ini sudah dipakai pengguna lain';
  when check_violation then raise exception 'Data pengguna tidak valid (periksa nama, email, dan peran)';
end;
$$;

create or replace function public.admin_ubah_pengguna(p_aktor uuid, p_id uuid, p_nama text, p_email text, p_peran text, p_unit text, p_aktif boolean)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin public.pengguna;
  l public.pengguna;
  v public.pengguna;
  v_ubah jsonb := '[]'::jsonb;
  v_aksi text := 'mengubah data pengguna';
  v_akt jsonb;
  v_batasan text;
begin
  v_admin := app.wajib_admin(p_aktor);
  select * into l from public.pengguna where id = p_id and deleted_at is null for update;
  if l.id is null then raise exception 'Pengguna tidak ditemukan'; end if;
  if p_id = v_admin.id and (p_peran <> l.peran or not p_aktif) then
    raise exception 'Peran dan status akun Anda sendiri tidak bisa diubah';
  end if;
  if l.peran = 'Administrator' and l.aktif and (p_peran <> 'Administrator' or not p_aktif)
     and (select count(*) from public.pengguna where peran = 'Administrator' and aktif and deleted_at is null) <= 1 then
    raise exception 'Minimal harus ada satu Administrator aktif';
  end if;
  if p_aktif then perform app.periksa_satu_akun(p_peran, p_id); end if;
  if l.nama <> btrim(p_nama) then v_ubah := v_ubah || app.ubah('Nama', l.nama, btrim(p_nama)); end if;
  if l.email <> lower(btrim(p_email)) then v_ubah := v_ubah || app.ubah('Email', l.email, lower(btrim(p_email))); end if;
  if l.peran <> p_peran then v_ubah := v_ubah || app.ubah('Peran', l.peran, p_peran); end if;
  if l.aktif <> p_aktif then
    v_ubah := v_ubah || app.ubah('Status', case when l.aktif then 'Aktif' else 'Nonaktif' end, case when p_aktif then 'Aktif' else 'Nonaktif' end);
    if jsonb_array_length(v_ubah) = 1 then v_aksi := case when p_aktif then 'mengaktifkan pengguna' else 'menonaktifkan pengguna' end; end if;
  end if;
  update public.pengguna set nama = btrim(p_nama), email = lower(btrim(p_email)), peran = p_peran, unit = null, aktif = p_aktif
  where id = p_id returning * into v;
  if jsonb_array_length(v_ubah) > 0 then
    v_akt := app.catat(v_admin.id, 'Pengguna', 'Pengguna', v_aksi, v.id::text, v.nama, v_ubah);
  end if;
  return jsonb_build_object('pengguna', to_jsonb(v), 'aktivitas', case when v_akt is null then '[]'::jsonb else jsonb_build_array(v_akt) end);
exception
  when unique_violation then
    get stacked diagnostics v_batasan = constraint_name;
    if v_batasan = 'pengguna_satu_akun_per_peran' then raise exception 'Peran % hanya boleh satu akun aktif', p_peran; end if;
    raise exception 'Email ini sudah dipakai pengguna lain';
  when check_violation then raise exception 'Data pengguna tidak valid (periksa nama, email, dan peran)';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Hak akses fungsi baru
-- ---------------------------------------------------------------------
revoke execute on function app.periksa_satu_akun(text, uuid) from public, anon, authenticated;
grant execute on function app.periksa_satu_akun(text, uuid) to service_role;
