-- =====================================================================
-- BELANJAKU — skema database Supabase (PostgreSQL 15+)
-- Politeknik Ilmu Pelayaran Makassar · Satker 287494
--
-- Isi:
--   1. Skema internal "app" + tabel nomor urut
--   2. Tabel referensi, pengguna, pengajuan, SPP, pengesahan (SP3B), aktivitas, Kertas Kerja POK
--   3. Fungsi bantu: profil & izin pengguna, format rupiah/tanggal, log aktivitas
--   4. RLS: siapa boleh MEMBACA baris apa (per peran & unit)
--   5. RPC: semua perubahan data lewat fungsi yang memeriksa peran, status dokumen,
--      dan menulis riwayat aktivitas dalam satu transaksi
--   6. Storage bucket "fa-detail", realtime, hak akses (GRANT)
--
-- Aturan peran sama dengan lib/akses.ts (tabel izin_peran di bawah).
-- Rollback: supabase/rollback/20261018210500_belanjaku_skema_down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Skema internal (tidak terbuka lewat API)
-- ---------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

create table app.nomor_urut (
  jenis     text     not null check (jenis in ('pengajuan', 'spp')),
  tahun     smallint not null check (tahun between 2000 and 2100),
  terakhir  integer  not null default 0 check (terakhir >= 0),
  primary key (jenis, tahun)
);
comment on table app.nomor_urut is 'Penghitung nomor dokumen per tahun; nomor tidak pernah dipakai ulang walau dokumennya dihapus.';

-- updated_at otomatis
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Tabel
-- ---------------------------------------------------------------------

-- Matriks izin per peran (sumber kebenaran hak akses; sama dengan lib/akses.ts)
create table public.izin_peran (
  peran      text not null check (peran in ('Administrator', 'PPK', 'PPSPM', 'Bendahara Pengeluaran', 'Operator Unit')),
  izin       text not null check (izin ~ '^[a-z]+\.[a-zA-Z0-9]+$'),
  created_at timestamptz not null default now(),
  primary key (peran, izin)
);
comment on table public.izin_peran is 'Izin aksi per peran. Ubah bersamaan dengan lib/akses.ts.';

insert into public.izin_peran (peran, izin) values
  ('Administrator', 'belanja.buat'), ('Administrator', 'belanja.verifikasi'), ('Administrator', 'belanja.lihatSemua'),
  ('Administrator', 'aktivitas.semua'), ('Administrator', 'referensi.kelola'), ('Administrator', 'pengguna.kelola'),
  ('Administrator', 'pok.unggah'),
  ('PPK', 'belanja.setujui'), ('PPK', 'belanja.lihatSemua'), ('PPK', 'pencairan.spp'), ('PPK', 'aktivitas.semua'),
  ('PPSPM', 'belanja.lihatSemua'), ('PPSPM', 'pencairan.ppspm'), ('PPSPM', 'aktivitas.semua'),
  ('Bendahara Pengeluaran', 'belanja.lihatSemua'), ('Bendahara Pengeluaran', 'pencairan.sp2d'),
  ('Bendahara Pengeluaran', 'pengesahan.sahkan'), ('Bendahara Pengeluaran', 'aktivitas.semua'),
  ('Operator Unit', 'belanja.buat'), ('Operator Unit', 'pok.unggah');

-- Referensi: unit kerja
create table public.unit_kerja (
  kode              text primary key check (kode ~ '^[A-Z0-9][A-Z0-9-]{1,11}$'),
  nama              text not null check (length(btrim(nama)) between 3 and 150),
  penanggung_jawab  text not null default '' check (length(penanggung_jawab) <= 150),
  aktif             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create unique index unit_kerja_nama_unik on public.unit_kerja (lower(nama)) where deleted_at is null;

-- Referensi: sumber dana
create table public.sumber_dana (
  kode        text primary key check (kode ~ '^[A-Z]{2,6}$'),
  nama        text not null check (length(btrim(nama)) between 2 and 100),
  warna       text not null default '#9b9ba4' check (warna ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- Referensi: akun belanja (BAS). Jenis belanja & sumber dana diturunkan dari kode akun.
create table public.akun (
  kode           text primary key check (kode ~ '^[0-9]{6}$'),
  uraian         text not null check (length(btrim(uraian)) between 2 and 200),
  jenis_belanja  text generated always as (
                   case left(kode, 2) when '51' then 'Pegawai' when '52' then 'Barang' when '53' then 'Modal' else 'Lainnya' end
                 ) stored,
  dana           text generated always as (
                   case when left(kode, 3) in ('525', '537') then 'BLU' else 'RM' end
                 ) stored,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- Referensi: penyedia / pihak penerima pembayaran
create table public.penyedia (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null check (length(btrim(nama)) between 2 and 150),
  bidang      text not null default '' check (length(bidang) <= 150),
  kota        text not null default '' check (length(kota) <= 100),
  aktif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index penyedia_nama_unik on public.penyedia (lower(nama)) where deleted_at is null;

-- Pengguna aplikasi (profil). auth_id menautkan ke akun login Supabase Auth;
-- profil tetap disimpan setelah akun login dihapus agar riwayat tetap terbaca.
create table public.pengguna (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique references auth.users (id) on delete set null,
  nama        text not null check (length(btrim(nama)) between 2 and 120),
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  peran       text not null check (peran in ('Administrator', 'PPK', 'PPSPM', 'Bendahara Pengeluaran', 'Operator Unit')),
  unit        text references public.unit_kerja (kode) on update cascade,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint operator_wajib_unit check (peran <> 'Operator Unit' or unit is not null)
);
create unique index pengguna_email_unik on public.pengguna (email) where deleted_at is null;
create index pengguna_unit_idx on public.pengguna (unit);

-- Pengajuan belanja (satu dokumen yang mengalir: Belanja → Pencairan → Pengesahan)
create table public.pengajuan (
  id             text primary key check (id ~ '^BLJ-[0-9]{4}-[0-9]{4,}$'),
  uraian         text not null check (length(btrim(uraian)) between 3 and 300),
  jenis_dokumen  text not null check (jenis_dokumen in ('Kwitansi', 'Kontrak', 'Honorarium', 'Gaji', 'Perjadin')),
  no_dokumen     text not null check (length(btrim(no_dokumen)) between 1 and 100),
  penyedia_id    uuid not null references public.penyedia (id),
  unit           text not null references public.unit_kerja (kode) on update cascade,
  dana           text not null references public.sumber_dana (kode) check (dana in ('RM', 'BLU')),
  mak            text not null check (mak ~ '^[0-9]{4}\.[A-Z]{3}\.[0-9]{3}\.[0-9]{3}\.[0-9A-Z]{1,3}\.[0-9]{6}$'),
  akun           text generated always as (right(mak, 6)) stored references public.akun (kode),
  nilai          bigint not null check (nilai > 0),
  tanggal        date not null,
  status         text not null default 'Draf' check (status in ('Draf', 'Diajukan', 'Diverifikasi', 'Disetujui', 'Ditolak')),
  dibuat_oleh    uuid not null references public.pengguna (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  dihapus_oleh   uuid references public.pengguna (id),
  alasan_hapus   text,
  -- akun harus sesuai sumber dana: BLU hanya 525xxx/537xxx, RM selain itu
  constraint akun_sesuai_dana check ((dana = 'BLU') = (left(right(mak, 6), 3) in ('525', '537'))),
  constraint hapus_lengkap check (deleted_at is null or (dihapus_oleh is not null and length(btrim(alasan_hapus)) >= 5))
);
create index pengajuan_unit_idx on public.pengajuan (unit);
create index pengajuan_status_idx on public.pengajuan (status) where deleted_at is null;
create index pengajuan_tanggal_idx on public.pengajuan (tanggal desc);
create index pengajuan_dibuat_oleh_idx on public.pengajuan (dibuat_oleh);
create index pengajuan_penyedia_idx on public.pengajuan (penyedia_id);
create index pengajuan_dana_idx on public.pengajuan (dana);
create index pengajuan_akun_idx on public.pengajuan (akun);
create index pengajuan_dihapus_oleh_idx on public.pengajuan (dihapus_oleh);

-- SPP s.d. SP2D (satu SPP per pengajuan). Tahap: 1 SPP, 2 Verifikasi PPSPM, 3 SPM, 4 SP2D terbit
create table public.spp (
  pengajuan_id  text primary key references public.pengajuan (id),
  nomor         text not null unique check (nomor ~ '^[0-9]{5}/SPP-(LS|GU|TUP)/[0-9]{4}$'),
  jenis         text not null check (jenis in ('LS', 'GU', 'TUP')),
  tahap         smallint not null default 1 check (tahap between 1 and 4),
  tanggal       date not null,
  sp2d_pada     timestamptz,
  dibuat_oleh   uuid not null references public.pengguna (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sp2d_saat_tahap_4 check ((tahap = 4) = (sp2d_pada is not null))
);
create index spp_tahap_idx on public.spp (tahap);
create index spp_dibuat_oleh_idx on public.spp (dibuat_oleh);

-- SP3B BLU per bulan. *_awal untuk saldo periode sebelum aplikasi dipakai (opsional).
create table public.sp3b (
  nomor            text primary key check (nomor ~ '^SP3B-BLU-[0-9]{2}/[0-9]{4}$'),
  bulan            date not null unique check (extract(day from bulan) = 1),
  periode          text not null,
  pencairan_awal   bigint not null default 0 check (pencairan_awal >= 0),
  pengesahan_awal  bigint not null default 0 check (pengesahan_awal >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Pengesahan belanja BLU (satu kali per pengajuan)
create table public.pengesahan (
  pengajuan_id   text primary key references public.pengajuan (id),
  sp3b_nomor     text not null references public.sp3b (nomor),
  tanggal        date not null,
  disahkan_oleh  uuid not null references public.pengguna (id),
  created_at     timestamptz not null default now()
);
create index pengesahan_sp3b_idx on public.pengesahan (sp3b_nomor);
create index pengesahan_oleh_idx on public.pengesahan (disahkan_oleh);

-- Riwayat aktivitas (jejak audit, hanya bertambah)
create table public.aktivitas (
  id           bigint generated always as identity primary key,
  waktu        timestamptz not null default now(),
  oleh         uuid not null references public.pengguna (id),
  jenis        text not null check (jenis in ('Buat', 'Ubah', 'Hapus', 'Cetak', 'Status', 'Pencairan', 'Pengesahan', 'Pengguna', 'Referensi', 'Sesi')),
  modul        text not null check (modul in ('Belanja', 'Pencairan', 'Pengesahan', 'Pengguna', 'Referensi', 'Sistem')),
  aksi         text not null check (length(aksi) between 3 and 200),
  objek_id     text,
  objek_label  text,
  perubahan    jsonb check (perubahan is null or jsonb_typeof(perubahan) = 'array'),
  catatan      text check (length(catatan) <= 1000),
  -- unit dokumen terkait, agar Operator Unit dapat melihat aktivitas dokumen unitnya
  unit         text references public.unit_kerja (kode) on update cascade
);
create index aktivitas_waktu_idx on public.aktivitas (waktu desc);
create index aktivitas_objek_idx on public.aktivitas (objek_id) where objek_id is not null;
create index aktivitas_oleh_idx on public.aktivitas (oleh);
create index aktivitas_unit_idx on public.aktivitas (unit);

-- Kertas Kerja POK: satu baris per upload FA Detail SAKTI; hanya satu yang aktif per tahun
create table public.pok_unggahan (
  id               bigint generated always as identity primary key,
  tahun            smallint not null check (tahun between 2000 and 2100),
  periode          text not null default '',
  satker           text not null default '',
  file_nama        text not null check (length(file_nama) between 1 and 255),
  file_path        text,
  jumlah_mak       integer not null check (jumlah_mak > 0),
  jumlah_item      integer not null default 0 check (jumlah_item >= 0),
  total_pagu       bigint not null default 0,
  total_lock       bigint not null default 0,
  total_realisasi  bigint not null default 0,
  aktif            boolean not null default true,
  diunggah_oleh    uuid references public.pengguna (id),
  created_at       timestamptz not null default now()
);
create unique index pok_satu_aktif_per_tahun on public.pok_unggahan (tahun) where aktif;
create index pok_unggahan_oleh_idx on public.pok_unggahan (diunggah_oleh);

create table public.pok_uraian (
  unggahan_id  bigint not null references public.pok_unggahan (id) on delete cascade,
  kode         text not null check (length(kode) between 1 and 40),
  uraian       text not null,
  primary key (unggahan_id, kode)
);

create table public.pok_mak (
  unggahan_id  bigint not null references public.pok_unggahan (id) on delete cascade,
  kode         text not null check (kode ~ '^[0-9]{4}\.[A-Z]{3}\.[0-9]{3}\.[0-9]{3}\.[0-9A-Z]{1,3}\.[0-9]{6}$'),
  urut         integer not null,
  akun         text generated always as (right(kode, 6)) stored references public.akun (kode),
  pagu         bigint not null default 0,
  lock         bigint not null default 0,
  realisasi    bigint not null default 0,
  primary key (unggahan_id, kode)
);
create index pok_mak_urut_idx on public.pok_mak (unggahan_id, urut);
create index pok_mak_akun_idx on public.pok_mak (akun);

create table public.pok_item (
  id           bigint generated always as identity primary key,
  unggahan_id  bigint not null,
  kode_mak     text not null,
  urut         integer not null,
  no_item      text not null default '',
  uraian       text not null,
  pagu         bigint not null default 0,
  lock         bigint not null default 0,
  realisasi    bigint not null default 0,
  foreign key (unggahan_id, kode_mak) references public.pok_mak (unggahan_id, kode) on delete cascade
);
create index pok_item_mak_idx on public.pok_item (unggahan_id, kode_mak, urut);

-- updated_at
create trigger set_updated_at before update on public.unit_kerja  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.sumber_dana for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.akun        for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.penyedia    for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.pengguna    for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.pengajuan   for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.spp         for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.sp3b        for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Fungsi bantu
-- ---------------------------------------------------------------------

-- Profil aktif milik pengguna yang sedang login (null bila belum terdaftar / nonaktif)
create or replace function app.profil_saya()
returns public.pengguna
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.pengguna p
  where p.auth_id = auth.uid() and p.aktif and p.deleted_at is null
$$;

create or replace function app.aktif_saya()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.pengguna p where p.auth_id = auth.uid() and p.aktif and p.deleted_at is null) $$;

create or replace function app.id_saya()
returns uuid language sql stable security definer set search_path = ''
as $$ select p.id from public.pengguna p where p.auth_id = auth.uid() and p.aktif and p.deleted_at is null $$;

create or replace function app.unit_saya()
returns text language sql stable security definer set search_path = ''
as $$ select p.unit from public.pengguna p where p.auth_id = auth.uid() and p.aktif and p.deleted_at is null $$;

create or replace function app.punya_izin(p_izin text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pengguna p
    join public.izin_peran i on i.peran = p.peran and i.izin = p_izin
    where p.auth_id = auth.uid() and p.aktif and p.deleted_at is null
  )
$$;

-- Pastikan pengguna login & aktif; kembalikan profilnya
create or replace function app.wajib_profil()
returns public.pengguna
language plpgsql stable security definer set search_path = ''
as $$
declare v public.pengguna;
begin
  select * into v from app.profil_saya();
  if v.id is null then
    raise exception 'Sesi tidak valid atau akun nonaktif. Silakan masuk kembali.' using errcode = '42501';
  end if;
  return v;
end;
$$;

-- Hentikan bila peran tidak memiliki izin
create or replace function app.wajib_izin(p_izin text, p_aksi text)
returns public.pengguna
language plpgsql stable security definer set search_path = ''
as $$
declare v public.pengguna;
begin
  v := app.wajib_profil();
  if not exists (select 1 from public.izin_peran i where i.peran = v.peran and i.izin = p_izin) then
    raise exception 'Peran % tidak berwenang %', v.peran, p_aksi using errcode = '42501';
  end if;
  return v;
end;
$$;

-- Rp1.234.567
create or replace function app.rupiah(n bigint)
returns text language sql immutable set search_path = ''
as $$
  select case when n < 0 then '−' else '' end || 'Rp' ||
         replace(to_char(abs(n), 'FM999,999,999,999,999,990'), ',', '.')
$$;

-- 18 Okt 2026
create or replace function app.tgl(d date)
returns text language sql immutable set search_path = ''
as $$
  select extract(day from d)::int || ' ' ||
         (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[extract(month from d)::int] || ' ' ||
         extract(year from d)::int
$$;

create or replace function app.tahun_ini()
returns smallint language sql stable set search_path = ''
as $$ select extract(year from (now() at time zone 'Asia/Makassar'))::smallint $$;

create or replace function app.nomor_berikut(p_jenis text, p_tahun smallint)
returns integer language sql volatile security definer set search_path = ''
as $$
  insert into app.nomor_urut as n (jenis, tahun, terakhir) values (p_jenis, p_tahun, 1)
  on conflict (jenis, tahun) do update set terakhir = n.terakhir + 1
  returning terakhir
$$;

-- Bentuk JSON satu aktivitas (sama dengan tipe Aktivitas di lib/types.ts)
create or replace function app.json_aktivitas(a public.aktivitas)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', a.id::text,
    'waktu', to_char(a.waktu at time zone 'Asia/Makassar', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'oleh', a.oleh,
    'jenis', a.jenis,
    'modul', a.modul,
    'aksi', a.aksi,
    'objekId', a.objek_id,
    'objekLabel', a.objek_label,
    'perubahan', a.perubahan,
    'catatan', a.catatan
  ))
$$;

-- Tulis satu baris aktivitas, kembalikan JSON-nya
create or replace function app.catat(
  p_oleh uuid, p_jenis text, p_modul text, p_aksi text,
  p_objek_id text default null, p_objek_label text default null,
  p_perubahan jsonb default null, p_catatan text default null, p_unit text default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare v public.aktivitas;
begin
  insert into public.aktivitas (oleh, jenis, modul, aksi, objek_id, objek_label, perubahan, catatan, unit)
  values (p_oleh, p_jenis, p_modul, p_aksi, p_objek_id, p_objek_label,
          case when p_perubahan is null or jsonb_array_length(p_perubahan) = 0 then null else p_perubahan end,
          nullif(btrim(coalesce(p_catatan, '')), ''), p_unit)
  returning * into v;
  return app.json_aktivitas(v);
end;
$$;

create or replace function app.ubah(p_kolom text, p_dari text, p_ke text)
returns jsonb language sql immutable set search_path = ''
as $$ select jsonb_build_object('kolom', p_kolom, 'dari', coalesce(p_dari, '-'), 'ke', coalesce(p_ke, '-')) $$;

-- Bentuk JSON satu pengajuan (sama dengan tipe Kegiatan di lib/types.ts)
create or replace function app.json_pengajuan(p_id text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', k.id, 'uraian', k.uraian, 'noDokumen', k.no_dokumen, 'jenisDokumen', k.jenis_dokumen,
    'penyediaId', k.penyedia_id, 'penyedia', pv.nama, 'dana', k.dana, 'mak', k.mak, 'akun', k.akun,
    'unit', k.unit, 'nilai', k.nilai, 'tanggal', to_char(k.tanggal, 'YYYY-MM-DD'), 'status', k.status,
    'dibuatOleh', k.dibuat_oleh,
    'spp', case when s.pengajuan_id is null then null else jsonb_build_object(
      'no', s.nomor, 'jenis', s.jenis, 'tahap', s.tahap, 'tanggal', to_char(s.tanggal, 'YYYY-MM-DD')) end,
    'disahkan', case when g.pengajuan_id is null then null else jsonb_build_object(
      'nomor', g.sp3b_nomor, 'tanggal', to_char(g.tanggal, 'YYYY-MM-DD')) end
  ))
  from public.pengajuan k
  join public.penyedia pv on pv.id = k.penyedia_id
  left join public.spp s on s.pengajuan_id = k.id
  left join public.pengesahan g on g.pengajuan_id = k.id
  where k.id = p_id
$$;

-- Sisa pagu MAK pada Kertas Kerja POK aktif (null bila MAK tidak ada)
create or replace function app.sisa_mak(p_mak text)
returns bigint language sql stable security definer set search_path = ''
as $$
  select m.pagu - m.lock - m.realisasi
  from public.pok_mak m
  join public.pok_unggahan u on u.id = m.unggahan_id and u.aktif
  where m.kode = p_mak
  order by u.tahun desc
  limit 1
$$;

-- Validasi isi pengajuan (dipakai saat buat & ubah)
create or replace function app.periksa_isi_pengajuan(p jsonb, v_profil public.pengguna)
returns void language plpgsql stable security definer set search_path = ''
as $$
declare
  v_mak text := btrim(coalesce(p->>'mak', ''));
  v_dana text := p->>'dana';
  v_nilai numeric;
  v_sisa bigint;
begin
  if length(btrim(coalesce(p->>'uraian', ''))) < 3 then raise exception 'Uraian kegiatan minimal 3 karakter'; end if;
  if coalesce(p->>'jenisDokumen', '') not in ('Kwitansi', 'Kontrak', 'Honorarium', 'Gaji', 'Perjadin') then raise exception 'Jenis dokumen tidak dikenal'; end if;
  if length(btrim(coalesce(p->>'noDokumen', ''))) = 0 then raise exception 'Nomor dokumen wajib diisi'; end if;
  if not exists (select 1 from public.penyedia x where x.id = (p->>'penyediaId')::uuid and x.aktif and x.deleted_at is null) then
    raise exception 'Penyedia tidak ditemukan atau tidak aktif';
  end if;
  if not exists (select 1 from public.unit_kerja u where u.kode = p->>'unit' and u.aktif and u.deleted_at is null) then
    raise exception 'Unit kerja tidak ditemukan atau tidak aktif';
  end if;
  if not exists (select 1 from public.izin_peran i where i.peran = v_profil.peran and i.izin = 'belanja.lihatSemua')
     and p->>'unit' is distinct from v_profil.unit then
    raise exception 'Operator Unit hanya dapat mengajukan untuk unitnya sendiri';
  end if;
  if coalesce(v_dana, '') not in ('RM', 'BLU') then raise exception 'Sumber dana harus RM atau BLU'; end if;
  if v_mak !~ '^[0-9]{4}\.[A-Z]{3}\.[0-9]{3}\.[0-9]{3}\.[0-9A-Z]{1,3}\.[0-9]{6}$' then raise exception 'Format MAK tidak valid: %', v_mak; end if;
  if (v_dana = 'BLU') <> (left(right(v_mak, 6), 3) in ('525', '537')) then
    raise exception 'MAK % tidak sesuai untuk sumber dana %', v_mak, v_dana;
  end if;
  begin
    v_nilai := (p->>'nilai')::numeric;
  exception when others then
    raise exception 'Nilai harus berupa angka';
  end;
  if v_nilai is null or v_nilai <= 0 or v_nilai <> trunc(v_nilai) then raise exception 'Nilai harus bilangan bulat lebih dari 0'; end if;
  if (p->>'tanggal') is null then raise exception 'Tanggal dokumen wajib diisi'; end if;
  v_sisa := app.sisa_mak(v_mak);
  if v_sisa is null then raise exception 'MAK % tidak ada di Kertas Kerja POK yang aktif', v_mak; end if;
  if v_nilai > v_sisa then raise exception 'Nilai melebihi sisa pagu MAK (sisa %)', app.rupiah(v_sisa); end if;
end;
$$;

-- Profil otomatis untuk pengguna pertama (Administrator) yang dibuat di dashboard Supabase.
-- Pengguna berikutnya dibuat Administrator lewat modul Pengguna (API server).
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
      (select u.kode from public.unit_kerja u where u.deleted_at is null order by u.kode limit 1),
      true
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger belanjaku_pengguna_baru
  after insert on auth.users
  for each row execute function app.pengguna_auth_baru();

-- ---------------------------------------------------------------------
-- 4. View baca (RLS tabel dasar tetap berlaku: security_invoker)
-- ---------------------------------------------------------------------
create view public.v_pengajuan with (security_invoker = true) as
select
  k.id, k.uraian, k.no_dokumen, k.jenis_dokumen, k.penyedia_id, pv.nama as penyedia,
  k.dana, k.mak, k.akun, k.unit, k.nilai, k.tanggal, k.status, k.dibuat_oleh,
  s.nomor as spp_nomor, s.jenis as spp_jenis, s.tahap as spp_tahap, s.tanggal as spp_tanggal,
  g.sp3b_nomor as disahkan_nomor, g.tanggal as disahkan_tanggal,
  k.created_at, k.updated_at
from public.pengajuan k
join public.penyedia pv on pv.id = k.penyedia_id
left join public.spp s on s.pengajuan_id = k.id
left join public.pengesahan g on g.pengajuan_id = k.id
where k.deleted_at is null;

-- ---------------------------------------------------------------------
-- 5. RLS (hanya BACA; semua perubahan lewat RPC di bawah)
-- ---------------------------------------------------------------------
alter table public.izin_peran   enable row level security;
alter table public.unit_kerja   enable row level security;
alter table public.sumber_dana  enable row level security;
alter table public.akun         enable row level security;
alter table public.penyedia     enable row level security;
alter table public.pengguna     enable row level security;
alter table public.pengajuan    enable row level security;
alter table public.spp          enable row level security;
alter table public.sp3b         enable row level security;
alter table public.pengesahan   enable row level security;
alter table public.aktivitas    enable row level security;
alter table public.pok_unggahan enable row level security;
alter table public.pok_uraian   enable row level security;
alter table public.pok_mak      enable row level security;
alter table public.pok_item     enable row level security;
alter table app.nomor_urut      enable row level security;

create policy "pengguna aktif membaca izin"      on public.izin_peran   for select to authenticated using ((select app.aktif_saya()));
create policy "pengguna aktif membaca unit"      on public.unit_kerja   for select to authenticated using ((select app.aktif_saya()) and deleted_at is null);
create policy "pengguna aktif membaca dana"      on public.sumber_dana  for select to authenticated using ((select app.aktif_saya()) and deleted_at is null);
create policy "pengguna aktif membaca akun"      on public.akun         for select to authenticated using ((select app.aktif_saya()) and deleted_at is null);
create policy "pengguna aktif membaca penyedia"  on public.penyedia     for select to authenticated using ((select app.aktif_saya()) and deleted_at is null);
create policy "pengguna aktif membaca sp3b"      on public.sp3b         for select to authenticated using ((select app.aktif_saya()));
create policy "pengguna aktif membaca pok"       on public.pok_unggahan for select to authenticated using ((select app.aktif_saya()));
create policy "pengguna aktif membaca uraian pok" on public.pok_uraian  for select to authenticated using ((select app.aktif_saya()));
create policy "pengguna aktif membaca mak pok"   on public.pok_mak      for select to authenticated using ((select app.aktif_saya()));
create policy "pengguna aktif membaca item pok"  on public.pok_item     for select to authenticated using ((select app.aktif_saya()));

-- Profil sendiri selalu terbaca (untuk pesan "akun nonaktif"); pengguna aktif membaca semua profil
create policy "membaca profil" on public.pengguna for select to authenticated
  using (auth_id = (select auth.uid()) or (select app.aktif_saya()));

-- Operator Unit hanya pengajuan unitnya; peran lain semua unit
create policy "membaca pengajuan" on public.pengajuan for select to authenticated
  using (
    deleted_at is null
    and (select app.aktif_saya())
    and ((select app.punya_izin('belanja.lihatSemua')) or unit = (select app.unit_saya()))
  );

create policy "membaca spp" on public.spp for select to authenticated
  using (exists (select 1 from public.pengajuan k where k.id = spp.pengajuan_id));

create policy "membaca pengesahan" on public.pengesahan for select to authenticated
  using (exists (select 1 from public.pengajuan k where k.id = pengesahan.pengajuan_id));

-- Tanpa izin "aktivitas.semua": aktivitas sendiri + aktivitas dokumen unitnya
create policy "membaca aktivitas" on public.aktivitas for select to authenticated
  using (
    (select app.aktif_saya())
    and (
      (select app.punya_izin('aktivitas.semua'))
      or oleh = (select app.id_saya())
      or (unit is not null and unit = (select app.unit_saya()))
    )
  );

-- ---------------------------------------------------------------------
-- 6. RPC — Belanja
-- ---------------------------------------------------------------------
create or replace function public.buat_pengajuan(p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  v_tahun smallint := app.tahun_ini();
  v_id text;
  v_akt jsonb;
begin
  v_saya := app.wajib_izin('belanja.buat', 'membuat pengajuan');
  perform app.periksa_isi_pengajuan(p_data, v_saya);
  v_id := 'BLJ-' || v_tahun || '-' || lpad(app.nomor_berikut('pengajuan', v_tahun)::text, 4, '0');
  insert into public.pengajuan (id, uraian, jenis_dokumen, no_dokumen, penyedia_id, unit, dana, mak, nilai, tanggal, dibuat_oleh)
  values (v_id, btrim(p_data->>'uraian'), p_data->>'jenisDokumen', btrim(p_data->>'noDokumen'), (p_data->>'penyediaId')::uuid,
          p_data->>'unit', p_data->>'dana', btrim(p_data->>'mak'), (p_data->>'nilai')::bigint, (p_data->>'tanggal')::date, v_saya.id);
  v_akt := app.catat(v_saya.id, 'Buat', 'Belanja', 'membuat pengajuan', v_id, btrim(p_data->>'uraian'), null,
                     (p_data->>'jenisDokumen') || ' · ' || app.rupiah((p_data->>'nilai')::bigint) || ' · MAK ' || btrim(p_data->>'mak'),
                     p_data->>'unit');
  return jsonb_build_object('pengajuan', app.json_pengajuan(v_id), 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- Hanya pembuat dokumen; dokumen belum masuk pencairan
create or replace function app.wajib_pemilik(p_id text, v_saya public.pengguna, p_aksi text)
returns public.pengajuan language plpgsql volatile security definer set search_path = ''
as $$
declare k public.pengajuan;
begin
  select * into k from public.pengajuan where id = p_id and deleted_at is null for update;
  if k.id is null then raise exception 'Pengajuan % tidak ditemukan', p_id; end if;
  if k.dibuat_oleh <> v_saya.id then
    raise exception 'Hanya % (pembuat dokumen) yang dapat % %',
      (select nama from public.pengguna where id = k.dibuat_oleh), p_aksi, p_id using errcode = '42501';
  end if;
  if exists (select 1 from public.pengesahan g where g.pengajuan_id = p_id) then
    raise exception '% sudah disahkan sehingga tidak bisa diubah atau dihapus', p_id;
  end if;
  if exists (select 1 from public.spp s where s.pengajuan_id = p_id) then
    raise exception '% sudah masuk proses pencairan (%) sehingga tidak bisa diubah atau dihapus', p_id,
      (select nomor from public.spp where pengajuan_id = p_id);
  end if;
  return k;
end;
$$;

create or replace function public.ubah_pengajuan(p_id text, p_data jsonb, p_catatan text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  k public.pengajuan;
  v_ubah jsonb := '[]'::jsonb;
  v_draf boolean;
  v_akt jsonb;
  v_peny_lama text; v_peny_baru text;
  v_unit_lama text; v_unit_baru text;
  v_akun_baru text := right(btrim(p_data->>'mak'), 6);
begin
  v_saya := app.wajib_izin('belanja.buat', 'mengubah pengajuan');
  k := app.wajib_pemilik(p_id, v_saya, 'mengubah atau menghapus');
  perform app.periksa_isi_pengajuan(p_data, v_saya);

  select nama into v_peny_lama from public.penyedia where id = k.penyedia_id;
  select nama into v_peny_baru from public.penyedia where id = (p_data->>'penyediaId')::uuid;
  select nama into v_unit_lama from public.unit_kerja where kode = k.unit;
  select nama into v_unit_baru from public.unit_kerja where kode = p_data->>'unit';

  if k.uraian <> btrim(p_data->>'uraian') then v_ubah := v_ubah || app.ubah('Uraian', k.uraian, btrim(p_data->>'uraian')); end if;
  if k.jenis_dokumen <> p_data->>'jenisDokumen' then v_ubah := v_ubah || app.ubah('Jenis dokumen', k.jenis_dokumen, p_data->>'jenisDokumen'); end if;
  if k.no_dokumen <> btrim(p_data->>'noDokumen') then v_ubah := v_ubah || app.ubah('No. dokumen', k.no_dokumen, btrim(p_data->>'noDokumen')); end if;
  if k.penyedia_id <> (p_data->>'penyediaId')::uuid then v_ubah := v_ubah || app.ubah('Penyedia', v_peny_lama, v_peny_baru); end if;
  if k.unit <> p_data->>'unit' then v_ubah := v_ubah || app.ubah('Unit kerja', v_unit_lama, v_unit_baru); end if;
  if k.dana <> p_data->>'dana' then v_ubah := v_ubah || app.ubah('Sumber dana', k.dana, p_data->>'dana'); end if;
  if k.mak <> btrim(p_data->>'mak') then v_ubah := v_ubah || app.ubah('MAK', k.mak, btrim(p_data->>'mak')); end if;
  if k.akun <> v_akun_baru then
    v_ubah := v_ubah || app.ubah('Akun',
      k.akun || ' ' || coalesce((select uraian from public.akun where kode = k.akun), '-'),
      v_akun_baru || ' ' || coalesce((select uraian from public.akun where kode = v_akun_baru), '-'));
  end if;
  if k.nilai <> (p_data->>'nilai')::bigint then v_ubah := v_ubah || app.ubah('Nilai', app.rupiah(k.nilai), app.rupiah((p_data->>'nilai')::bigint)); end if;
  if k.tanggal <> (p_data->>'tanggal')::date then v_ubah := v_ubah || app.ubah('Tanggal dokumen', app.tgl(k.tanggal), app.tgl((p_data->>'tanggal')::date)); end if;

  if jsonb_array_length(v_ubah) = 0 then
    return jsonb_build_object('berubah', 0, 'kembaliKeDraf', false, 'pengajuan', app.json_pengajuan(p_id), 'aktivitas', '[]'::jsonb);
  end if;

  v_draf := k.status <> 'Draf';
  if v_draf then v_ubah := v_ubah || app.ubah('Status', k.status, 'Draf'); end if;

  update public.pengajuan set
    uraian = btrim(p_data->>'uraian'), jenis_dokumen = p_data->>'jenisDokumen', no_dokumen = btrim(p_data->>'noDokumen'),
    penyedia_id = (p_data->>'penyediaId')::uuid, unit = p_data->>'unit', dana = p_data->>'dana', mak = btrim(p_data->>'mak'),
    nilai = (p_data->>'nilai')::bigint, tanggal = (p_data->>'tanggal')::date,
    status = case when v_draf then 'Draf' else status end
  where id = p_id;

  v_akt := app.catat(v_saya.id, 'Ubah', 'Belanja', 'mengubah pengajuan', p_id, btrim(p_data->>'uraian'), v_ubah, p_catatan, p_data->>'unit');
  return jsonb_build_object(
    'berubah', jsonb_array_length(v_ubah) - case when v_draf then 1 else 0 end,
    'kembaliKeDraf', v_draf,
    'pengajuan', app.json_pengajuan(p_id),
    'aktivitas', jsonb_build_array(v_akt)
  );
end;
$$;

create or replace function public.hapus_pengajuan(p_id text, p_alasan text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  k public.pengajuan;
  v_akt jsonb;
begin
  v_saya := app.wajib_izin('belanja.buat', 'menghapus pengajuan');
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Tuliskan alasan penghapusan (minimal 5 karakter)'; end if;
  k := app.wajib_pemilik(p_id, v_saya, 'mengubah atau menghapus');
  update public.pengajuan set deleted_at = now(), dihapus_oleh = v_saya.id, alasan_hapus = btrim(p_alasan) where id = p_id;
  -- isi dokumen disimpan di log agar tetap bisa ditelusuri setelah dihapus
  v_akt := app.catat(v_saya.id, 'Hapus', 'Belanja', 'menghapus pengajuan', p_id, k.uraian,
    jsonb_build_array(
      app.ubah('No. dokumen', k.jenis_dokumen || ' ' || k.no_dokumen, 'dihapus'),
      app.ubah('Penyedia', (select nama from public.penyedia where id = k.penyedia_id), 'dihapus'),
      app.ubah('MAK', k.mak, 'dihapus'),
      app.ubah('Akun', k.akun || ' ' || coalesce((select uraian from public.akun where kode = k.akun), '-'), 'dihapus'),
      app.ubah('Nilai', app.rupiah(k.nilai), 'dihapus'),
      app.ubah('Status', k.status, 'dihapus')
    ),
    p_alasan, k.unit);
  return jsonb_build_object('aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- Alur status: Draf → Diajukan (pembuat) → Diverifikasi (Administrator) → Disetujui / Ditolak (PPK); Ditolak → Draf (pembuat)
create or replace function public.ubah_status_pengajuan(p_id text, p_status text, p_catatan text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  k public.pengajuan;
  v_aksi text;
  v_akt jsonb;
begin
  v_saya := app.wajib_profil();
  select * into k from public.pengajuan where id = p_id and deleted_at is null for update;
  if k.id is null then raise exception 'Pengajuan % tidak ditemukan', p_id; end if;
  if k.status = p_status then raise exception 'Status % sudah %', p_id, p_status; end if;

  if p_status = 'Diajukan' then
    perform app.wajib_izin('belanja.buat', 'mengajukan pengajuan');
    if k.status <> 'Draf' then raise exception 'Hanya draf yang dapat diajukan (status saat ini %)', k.status; end if;
    if k.dibuat_oleh <> v_saya.id then
      raise exception 'Hanya % (pembuat dokumen) yang dapat mengajukan %', (select nama from public.pengguna where id = k.dibuat_oleh), p_id using errcode = '42501';
    end if;
    v_aksi := 'mengajukan untuk diverifikasi';
  elsif p_status = 'Draf' then
    perform app.wajib_izin('belanja.buat', 'mengembalikan pengajuan ke draf');
    if k.status <> 'Ditolak' then raise exception 'Hanya pengajuan yang ditolak yang dapat dikembalikan ke draf'; end if;
    if k.dibuat_oleh <> v_saya.id then
      raise exception 'Hanya % (pembuat dokumen) yang dapat mengubah %', (select nama from public.pengguna where id = k.dibuat_oleh), p_id using errcode = '42501';
    end if;
    v_aksi := 'mengembalikan ke draf';
  elsif p_status = 'Diverifikasi' then
    perform app.wajib_izin('belanja.verifikasi', 'memverifikasi pengajuan');
    if k.status <> 'Diajukan' then raise exception 'Hanya pengajuan berstatus Diajukan yang dapat diverifikasi (status saat ini %)', k.status; end if;
    if app.sisa_mak(k.mak) is null or k.nilai > app.sisa_mak(k.mak) then
      raise exception 'Pagu MAK % tidak mencukupi (sisa %)', k.mak, coalesce(app.rupiah(app.sisa_mak(k.mak)), 'tidak ada di POK');
    end if;
    v_aksi := 'memverifikasi pagu pengajuan';
  elsif p_status in ('Disetujui', 'Ditolak') then
    perform app.wajib_izin('belanja.setujui', 'menyetujui atau menolak pengajuan');
    if k.status <> 'Diverifikasi' then raise exception 'Hanya pengajuan yang sudah diverifikasi yang dapat disetujui atau ditolak (status saat ini %)', k.status; end if;
    v_aksi := case p_status when 'Disetujui' then 'menyetujui pengajuan' else 'mengembalikan pengajuan ke unit' end;
  else
    raise exception 'Status % tidak dikenal', p_status;
  end if;

  update public.pengajuan set status = p_status where id = p_id;
  v_akt := app.catat(v_saya.id, 'Status', 'Belanja', v_aksi, p_id, k.uraian,
                     jsonb_build_array(app.ubah('Status', k.status, p_status)), p_catatan, k.unit);
  return jsonb_build_object('pengajuan', app.json_pengajuan(p_id), 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- ---------------------------------------------------------------------
-- 7. RPC — Pencairan & Pengesahan
-- ---------------------------------------------------------------------
create or replace function public.buat_spp(p_pengajuan_id text, p_jenis text, p_tanggal date)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  k public.pengajuan;
  v_tahun smallint;
  v_nomor text;
  v_akt jsonb;
begin
  v_saya := app.wajib_izin('pencairan.spp', 'menerbitkan SPP');
  if p_jenis not in ('LS', 'GU', 'TUP') then raise exception 'Jenis SPP harus LS, GU, atau TUP'; end if;
  if p_tanggal is null then raise exception 'Tanggal SPP wajib diisi'; end if;
  select * into k from public.pengajuan where id = p_pengajuan_id and deleted_at is null for update;
  if k.id is null then raise exception 'Pengajuan % tidak ditemukan', p_pengajuan_id; end if;
  if k.status <> 'Disetujui' then raise exception 'SPP hanya untuk pengajuan yang disetujui PPK (status % %)', p_pengajuan_id, k.status; end if;
  if exists (select 1 from public.spp where pengajuan_id = p_pengajuan_id) then raise exception '% sudah dibuatkan SPP', p_pengajuan_id; end if;
  v_tahun := extract(year from p_tanggal)::smallint;
  v_nomor := lpad(app.nomor_berikut('spp', v_tahun)::text, 5, '0') || '/SPP-' || p_jenis || '/' || v_tahun;
  insert into public.spp (pengajuan_id, nomor, jenis, tahap, tanggal, dibuat_oleh)
  values (p_pengajuan_id, v_nomor, p_jenis, 1, p_tanggal, v_saya.id);
  v_akt := app.catat(v_saya.id, 'Pencairan', 'Pencairan', 'membuat SPP-' || p_jenis, p_pengajuan_id, k.uraian, null, 'No. ' || v_nomor, k.unit);
  return jsonb_build_object('nomor', v_nomor, 'pengajuan', app.json_pengajuan(p_pengajuan_id), 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

create or replace function public.majukan_tahap_spp(p_pengajuan_id text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  s public.spp;
  k public.pengajuan;
  v_ke smallint;
  v_nama text[] := array['SPP', 'Verifikasi', 'SPM', 'SP2D'];
  v_akt jsonb;
begin
  v_saya := app.wajib_profil();
  select * into s from public.spp where pengajuan_id = p_pengajuan_id for update;
  if s.pengajuan_id is null then raise exception 'SPP untuk % tidak ditemukan', p_pengajuan_id; end if;
  if s.tahap >= 4 then raise exception 'SP2D % sudah terbit', s.nomor; end if;
  v_ke := s.tahap + 1;
  if v_ke in (2, 3) then perform app.wajib_izin('pencairan.ppspm', 'memproses tahap ' || v_nama[v_ke]);
  else perform app.wajib_izin('pencairan.sp2d', 'memproses tahap ' || v_nama[v_ke]);
  end if;
  select * into k from public.pengajuan where id = p_pengajuan_id;
  update public.spp set tahap = v_ke, sp2d_pada = case when v_ke = 4 then now() else null end where pengajuan_id = p_pengajuan_id;
  v_akt := app.catat(v_saya.id, 'Pencairan', 'Pencairan',
    case v_ke when 2 then 'memverifikasi SPP' when 3 then 'menerbitkan SPM' else 'mencatat SP2D terbit' end,
    p_pengajuan_id, k.uraian, jsonb_build_array(app.ubah('Tahap', v_nama[s.tahap], v_nama[v_ke])), s.nomor, k.unit);
  return jsonb_build_object('pengajuan', app.json_pengajuan(p_pengajuan_id), 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- Sahkan belanja BLU yang SP2D-nya sudah terbit pada SP3B bulan berjalan (Asia/Makassar)
create or replace function public.sahkan_pengajuan(p_ids text[])
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  v_hari date := (now() at time zone 'Asia/Makassar')::date;
  v_bulan date := date_trunc('month', (now() at time zone 'Asia/Makassar'))::date;
  v_nomor text;
  v_bulan_nama text[] := array['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  v_id text;
  k public.pengajuan;
  v_akt jsonb := '[]'::jsonb;
  v_hasil jsonb := '[]'::jsonb;
begin
  v_saya := app.wajib_izin('pengesahan.sahkan', 'mengesahkan belanja');
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Pilih minimal satu kegiatan'; end if;
  v_nomor := 'SP3B-BLU-' || to_char(v_bulan, 'MM') || '/' || to_char(v_bulan, 'YYYY');
  insert into public.sp3b (nomor, bulan, periode)
  values (v_nomor, v_bulan, v_bulan_nama[extract(month from v_bulan)::int] || ' ' || extract(year from v_bulan)::int)
  on conflict (nomor) do nothing;

  foreach v_id in array (select array_agg(distinct x) from unnest(p_ids) x) loop
    select * into k from public.pengajuan where id = v_id and deleted_at is null for update;
    if k.id is null then raise exception 'Pengajuan % tidak ditemukan', v_id; end if;
    if k.dana <> 'BLU' then raise exception '% bukan belanja BLU', v_id; end if;
    if not exists (select 1 from public.spp where pengajuan_id = v_id and tahap = 4) then raise exception 'SP2D % belum terbit', v_id; end if;
    if exists (select 1 from public.pengesahan where pengajuan_id = v_id) then raise exception '% sudah disahkan', v_id; end if;
    insert into public.pengesahan (pengajuan_id, sp3b_nomor, tanggal, disahkan_oleh) values (v_id, v_nomor, v_hari, v_saya.id);
    v_akt := v_akt || app.catat(v_saya.id, 'Pengesahan', 'Pengesahan', 'mengesahkan pada ' || v_nomor, v_id, k.uraian, null, app.rupiah(k.nilai), k.unit);
    v_hasil := v_hasil || app.json_pengajuan(v_id);
  end loop;
  return jsonb_build_object('nomor', v_nomor, 'pengajuan', v_hasil, 'aktivitas', v_akt);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. RPC — Aktivitas dari browser (cetak, masuk/keluar)
-- ---------------------------------------------------------------------
create or replace function public.catat_aktivitas(
  p_jenis text, p_aksi text, p_objek_id text default null, p_objek_label text default null, p_catatan text default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  v_unit text;
begin
  v_saya := app.wajib_profil();
  if p_jenis = 'Cetak' then
    if p_aksi <> 'mencetak lembar pengajuan' then raise exception 'Aksi cetak tidak dikenal'; end if;
    select unit into v_unit from public.pengajuan where id = p_objek_id;
    if v_unit is null then raise exception 'Pengajuan % tidak ditemukan', p_objek_id; end if;
    return app.catat(v_saya.id, 'Cetak', 'Belanja', p_aksi, p_objek_id, p_objek_label, null, null, v_unit);
  elsif p_jenis = 'Sesi' then
    if p_aksi not in ('masuk ke aplikasi', 'keluar dari aplikasi') then raise exception 'Aksi sesi tidak dikenal'; end if;
    return app.catat(v_saya.id, 'Sesi', 'Sistem', p_aksi, null, null, null,
                     case when p_aksi = 'masuk ke aplikasi' then 'Peran ' || v_saya.peran end, null);
  end if;
  raise exception 'Jenis aktivitas % hanya dicatat oleh sistem', p_jenis using errcode = '42501';
end;
$$;

-- Riwayat lengkap satu dokumen (untuk fitur lacak dokumen)
create or replace function public.jejak_dokumen(p_objek_id text)
returns setof jsonb language sql stable security invoker set search_path = ''
as $$
  select app.json_aktivitas(a) from public.aktivitas a where a.objek_id = p_objek_id order by a.waktu desc, a.id desc
$$;

-- ---------------------------------------------------------------------
-- 9. RPC — Referensi
-- ---------------------------------------------------------------------
create or replace function public.simpan_referensi(p_jenis text, p_data jsonb, p_kode text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  v_label text;
  v_ubah jsonb := '[]'::jsonb;
  v_obj_id text;
  v_obj_label text;
  u public.unit_kerja; a public.akun; d public.sumber_dana; pv public.penyedia;
  v_akt jsonb;
begin
  v_saya := app.wajib_izin('referensi.kelola', 'mengubah referensi');
  v_label := case p_jenis when 'akun' then 'akun belanja' when 'unit' then 'unit kerja' when 'penyedia' then 'penyedia' when 'dana' then 'sumber dana' end;
  if v_label is null then raise exception 'Jenis referensi % tidak dikenal', p_jenis; end if;

  if p_kode is null then
    -- tambah baru
    case p_jenis
      when 'unit' then
        insert into public.unit_kerja (kode, nama, penanggung_jawab) values (upper(btrim(p_data->>'kode')), btrim(p_data->>'nama'), btrim(coalesce(p_data->>'penanggungJawab', '')))
        returning kode, nama into v_obj_id, v_obj_label;
      when 'akun' then
        insert into public.akun (kode, uraian) values (btrim(p_data->>'kode'), btrim(p_data->>'uraian')) returning kode, uraian into v_obj_id, v_obj_label;
      when 'dana' then
        insert into public.sumber_dana (kode, nama, warna) values (upper(btrim(p_data->>'kode')), btrim(p_data->>'nama'), btrim(p_data->>'warna')) returning kode, nama into v_obj_id, v_obj_label;
      when 'penyedia' then
        insert into public.penyedia (nama, bidang, kota) values (btrim(p_data->>'nama'), btrim(coalesce(p_data->>'bidang', '')), btrim(coalesce(p_data->>'kota', '')))
        returning id::text, nama into v_obj_id, v_obj_label;
    end case;
    v_akt := app.catat(v_saya.id, 'Referensi', 'Referensi', 'menambah ' || v_label, v_obj_id, v_obj_label);
  else
    -- ubah yang sudah ada
    case p_jenis
      when 'unit' then
        select * into u from public.unit_kerja where kode = p_kode and deleted_at is null for update;
        if u.kode is null then raise exception 'Unit % tidak ditemukan', p_kode; end if;
        if u.nama <> btrim(p_data->>'nama') then v_ubah := v_ubah || app.ubah('Nama', u.nama, btrim(p_data->>'nama')); end if;
        if u.penanggung_jawab <> btrim(coalesce(p_data->>'penanggungJawab', '')) then v_ubah := v_ubah || app.ubah('Penanggung jawab', u.penanggung_jawab, btrim(p_data->>'penanggungJawab')); end if;
        update public.unit_kerja set nama = btrim(p_data->>'nama'), penanggung_jawab = btrim(coalesce(p_data->>'penanggungJawab', '')) where kode = p_kode;
        v_obj_id := p_kode; v_obj_label := btrim(p_data->>'nama');
      when 'akun' then
        select * into a from public.akun where kode = p_kode and deleted_at is null for update;
        if a.kode is null then raise exception 'Akun % tidak ditemukan', p_kode; end if;
        if a.uraian <> btrim(p_data->>'uraian') then v_ubah := v_ubah || app.ubah('Uraian', a.uraian, btrim(p_data->>'uraian')); end if;
        update public.akun set uraian = btrim(p_data->>'uraian') where kode = p_kode;
        v_obj_id := p_kode; v_obj_label := btrim(p_data->>'uraian');
      when 'dana' then
        select * into d from public.sumber_dana where kode = p_kode and deleted_at is null for update;
        if d.kode is null then raise exception 'Sumber dana % tidak ditemukan', p_kode; end if;
        if d.nama <> btrim(p_data->>'nama') then v_ubah := v_ubah || app.ubah('Nama', d.nama, btrim(p_data->>'nama')); end if;
        if d.warna <> btrim(p_data->>'warna') then v_ubah := v_ubah || app.ubah('Warna', d.warna, btrim(p_data->>'warna')); end if;
        update public.sumber_dana set nama = btrim(p_data->>'nama'), warna = btrim(p_data->>'warna') where kode = p_kode;
        v_obj_id := p_kode; v_obj_label := btrim(p_data->>'nama');
      when 'penyedia' then
        select * into pv from public.penyedia where id = p_kode::uuid and deleted_at is null for update;
        if pv.id is null then raise exception 'Penyedia tidak ditemukan'; end if;
        if pv.nama <> btrim(p_data->>'nama') then v_ubah := v_ubah || app.ubah('Nama', pv.nama, btrim(p_data->>'nama')); end if;
        if pv.bidang <> btrim(coalesce(p_data->>'bidang', '')) then v_ubah := v_ubah || app.ubah('Bidang', pv.bidang, btrim(p_data->>'bidang')); end if;
        if pv.kota <> btrim(coalesce(p_data->>'kota', '')) then v_ubah := v_ubah || app.ubah('Kota', pv.kota, btrim(p_data->>'kota')); end if;
        if pv.aktif <> coalesce((p_data->>'aktif')::boolean, pv.aktif) then
          v_ubah := v_ubah || app.ubah('Status', case when pv.aktif then 'Aktif' else 'Tidak aktif' end, case when (p_data->>'aktif')::boolean then 'Aktif' else 'Tidak aktif' end);
        end if;
        update public.penyedia set nama = btrim(p_data->>'nama'), bidang = btrim(coalesce(p_data->>'bidang', '')),
          kota = btrim(coalesce(p_data->>'kota', '')), aktif = coalesce((p_data->>'aktif')::boolean, aktif)
        where id = pv.id;
        v_obj_id := pv.id::text; v_obj_label := btrim(p_data->>'nama');
    end case;
    if jsonb_array_length(v_ubah) = 0 then return jsonb_build_object('berubah', 0, 'aktivitas', '[]'::jsonb); end if;
    v_akt := app.catat(v_saya.id, 'Referensi', 'Referensi', 'mengubah ' || v_label, v_obj_id, v_obj_label, v_ubah);
  end if;
  return jsonb_build_object('berubah', greatest(jsonb_array_length(v_ubah), 1), 'aktivitas', jsonb_build_array(v_akt));
exception
  when unique_violation then raise exception 'Kode atau nama % sudah ada', v_label;
  when check_violation then raise exception 'Isian % tidak valid (periksa format kode, panjang nama, atau warna #RRGGBB)', v_label;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Kertas Kerja POK (FA Detail SAKTI)
-- ---------------------------------------------------------------------
-- Simpan isi FA Detail (format DataPok di lib/mak.ts) dan jadikan aktif untuk tahunnya
create or replace function app.simpan_pok(p_data jsonb, p_file_nama text, p_file_path text, p_oleh uuid)
returns bigint language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id bigint;
  v_tahun smallint;
  v_periode text := btrim(coalesce(p_data #>> '{sumber,periode}', ''));
  v_jml_mak int := jsonb_array_length(coalesce(p_data->'mak', '[]'::jsonb));
  v_jml_item int;
begin
  if v_jml_mak = 0 then raise exception 'FA Detail tidak berisi baris MAK'; end if;
  if jsonb_typeof(p_data->'uraian') <> 'object' or jsonb_typeof(p_data->'akun') <> 'object' then raise exception 'Format data FA Detail tidak valid'; end if;
  v_tahun := coalesce(substring(v_periode from '([0-9]{4})\s*$')::smallint, app.tahun_ini());
  select coalesce(sum(jsonb_array_length(value)), 0) into v_jml_item from jsonb_each(coalesce(p_data->'item', '{}'::jsonb));

  -- akun baru dari FA Detail ditambahkan ke referensi (nama akun yang sudah ada tidak ditimpa)
  insert into public.akun (kode, uraian)
  select key, btrim(value) from jsonb_each_text(p_data->'akun') where key ~ '^[0-9]{6}$'
  on conflict (kode) do nothing;
  insert into public.akun (kode, uraian)
  select distinct right(e->>0, 6), 'Akun ' || right(e->>0, 6) from jsonb_array_elements(p_data->'mak') e
  on conflict (kode) do nothing;

  update public.pok_unggahan set aktif = false where tahun = v_tahun and aktif;
  insert into public.pok_unggahan (tahun, periode, satker, file_nama, file_path, jumlah_mak, jumlah_item, aktif, diunggah_oleh)
  values (v_tahun, v_periode, btrim(coalesce(p_data #>> '{sumber,satker}', '')), p_file_nama, p_file_path, v_jml_mak, v_jml_item, true, p_oleh)
  returning id into v_id;

  insert into public.pok_uraian (unggahan_id, kode, uraian)
  select v_id, key, value from jsonb_each_text(p_data->'uraian');

  insert into public.pok_mak (unggahan_id, kode, urut, pagu, lock, realisasi)
  select v_id, e->>0, t.ord, round((e->>1)::numeric)::bigint, round((e->>2)::numeric)::bigint, round((e->>3)::numeric)::bigint
  from jsonb_array_elements(p_data->'mak') with ordinality as t(e, ord);

  insert into public.pok_item (unggahan_id, kode_mak, urut, no_item, uraian, pagu, lock, realisasi)
  select v_id, m.key, t.ord, coalesce(i->>0, ''), coalesce(i->>1, ''),
         round((i->>2)::numeric)::bigint, round((i->>3)::numeric)::bigint, round((i->>4)::numeric)::bigint
  from jsonb_each(coalesce(p_data->'item', '{}'::jsonb)) m
  cross join lateral jsonb_array_elements(m.value) with ordinality as t(i, ord);

  update public.pok_unggahan u set
    total_pagu = s.pagu, total_lock = s.lock, total_realisasi = s.realisasi
  from (select coalesce(sum(pagu), 0) pagu, coalesce(sum(lock), 0) lock, coalesce(sum(realisasi), 0) realisasi
        from public.pok_mak where unggahan_id = v_id) s
  where u.id = v_id;
  return v_id;
exception
  when foreign_key_violation then raise exception 'Rincian item FA Detail tidak cocok dengan daftar MAK';
  when check_violation then raise exception 'Kode MAK pada FA Detail tidak sesuai format Kegiatan.KRO.RO.Komponen.SubKomponen.Akun';
  when unique_violation then raise exception 'Kode MAK pada FA Detail muncul lebih dari sekali';
end;
$$;

create or replace function public.terapkan_pok(p_data jsonb, p_file_nama text, p_file_path text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  v_id bigint;
  u public.pok_unggahan;
  v_akt jsonb;
begin
  v_saya := app.wajib_izin('pok.unggah', 'mengunggah FA Detail');
  v_id := app.simpan_pok(p_data, p_file_nama, p_file_path, v_saya.id);
  select * into u from public.pok_unggahan where id = v_id;
  v_akt := app.catat(v_saya.id, 'Referensi', 'Referensi', 'mengunggah FA Detail (Kertas Kerja POK)', null, p_file_nama, null,
    'Periode ' || coalesce(nullif(u.periode, ''), '-') || ' · ' || u.jumlah_mak || ' MAK' ||
    case when u.jumlah_item > 0 then ' · ' || u.jumlah_item || ' item' else '' end ||
    ' · pagu ' || app.rupiah(u.total_pagu) || ' · realisasi ' || app.rupiah(u.total_realisasi));
  return jsonb_build_object('unggahan', v_id, 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- Kertas Kerja POK aktif dalam format DataPok (lib/mak.ts); null bila belum ada
create or replace function public.pok_aktif(p_tahun integer default null)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  with u as (
    select * from public.pok_unggahan
    where aktif and (p_tahun is null or tahun = p_tahun)
    order by tahun desc limit 1
  )
  select jsonb_build_object(
    'sumber', jsonb_strip_nulls(jsonb_build_object(
      'file', u.file_nama, 'periode', u.periode, 'satker', u.satker, 'tahun', u.tahun,
      'diunggah', case when u.diunggah_oleh is null then null else to_char(u.created_at at time zone 'Asia/Makassar', 'YYYY-MM-DD"T"HH24:MI:SS') end,
      'oleh', (select p.nama from public.pengguna p where p.id = u.diunggah_oleh))),
    'uraian', coalesce((select jsonb_object_agg(r.kode, r.uraian) from public.pok_uraian r where r.unggahan_id = u.id), '{}'::jsonb),
    'akun', coalesce((select jsonb_object_agg(a.kode, a.uraian) from public.akun a
                      where a.kode in (select m.akun from public.pok_mak m where m.unggahan_id = u.id)), '{}'::jsonb),
    'mak', coalesce((select jsonb_agg(jsonb_build_array(m.kode, m.pagu, m.lock, m.realisasi) order by m.urut)
                     from public.pok_mak m where m.unggahan_id = u.id), '[]'::jsonb),
    'item', coalesce((select jsonb_object_agg(x.kode_mak, x.isi) from (
                        select i.kode_mak, jsonb_agg(jsonb_build_array(i.no_item, i.uraian, i.pagu, i.lock, i.realisasi) order by i.urut) isi
                        from public.pok_item i where i.unggahan_id = u.id group by i.kode_mak) x), '{}'::jsonb)
  )
  from u
$$;

-- ---------------------------------------------------------------------
-- 11. RPC — kelola pengguna (HANYA dipanggil API server dengan service role)
-- ---------------------------------------------------------------------
create or replace function app.wajib_admin(p_aktor uuid)
returns public.pengguna language plpgsql stable security definer set search_path = ''
as $$
declare v public.pengguna;
begin
  select * into v from public.pengguna where id = p_aktor and aktif and deleted_at is null;
  if v.id is null or not exists (select 1 from public.izin_peran where peran = v.peran and izin = 'pengguna.kelola') then
    raise exception 'Hanya Administrator yang dapat mengelola pengguna' using errcode = '42501';
  end if;
  return v;
end;
$$;

create or replace function public.admin_tambah_pengguna(p_aktor uuid, p_auth_id uuid, p_nama text, p_email text, p_peran text, p_unit text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin public.pengguna;
  v public.pengguna;
  v_akt jsonb;
begin
  v_admin := app.wajib_admin(p_aktor);
  insert into public.pengguna (auth_id, nama, email, peran, unit)
  values (p_auth_id, btrim(p_nama), lower(btrim(p_email)), p_peran, nullif(p_unit, ''))
  returning * into v;
  v_akt := app.catat(v_admin.id, 'Pengguna', 'Pengguna', 'menambah pengguna', v.id::text, v.nama, null, v.peran || ' · ' || v.email);
  return jsonb_build_object('pengguna', to_jsonb(v), 'aktivitas', jsonb_build_array(v_akt));
exception
  when unique_violation then raise exception 'Email ini sudah dipakai pengguna lain';
  when check_violation then raise exception 'Data pengguna tidak valid (Operator Unit wajib punya unit kerja)';
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
  if l.nama <> btrim(p_nama) then v_ubah := v_ubah || app.ubah('Nama', l.nama, btrim(p_nama)); end if;
  if l.email <> lower(btrim(p_email)) then v_ubah := v_ubah || app.ubah('Email', l.email, lower(btrim(p_email))); end if;
  if l.peran <> p_peran then v_ubah := v_ubah || app.ubah('Peran', l.peran, p_peran); end if;
  if l.unit is distinct from nullif(p_unit, '') then
    v_ubah := v_ubah || app.ubah('Unit kerja',
      coalesce((select nama from public.unit_kerja where kode = l.unit), '-'),
      coalesce((select nama from public.unit_kerja where kode = nullif(p_unit, '')), '-'));
  end if;
  if l.aktif <> p_aktif then
    v_ubah := v_ubah || app.ubah('Status', case when l.aktif then 'Aktif' else 'Nonaktif' end, case when p_aktif then 'Aktif' else 'Nonaktif' end);
    if jsonb_array_length(v_ubah) = 1 then v_aksi := case when p_aktif then 'mengaktifkan pengguna' else 'menonaktifkan pengguna' end; end if;
  end if;
  update public.pengguna set nama = btrim(p_nama), email = lower(btrim(p_email)), peran = p_peran, unit = nullif(p_unit, ''), aktif = p_aktif
  where id = p_id returning * into v;
  if jsonb_array_length(v_ubah) > 0 then
    v_akt := app.catat(v_admin.id, 'Pengguna', 'Pengguna', v_aksi, v.id::text, v.nama, v_ubah);
  end if;
  return jsonb_build_object('pengguna', to_jsonb(v), 'aktivitas', case when v_akt is null then '[]'::jsonb else jsonb_build_array(v_akt) end);
exception
  when unique_violation then raise exception 'Email ini sudah dipakai pengguna lain';
  when check_violation then raise exception 'Data pengguna tidak valid (Operator Unit wajib punya unit kerja)';
end;
$$;

create or replace function public.admin_hapus_pengguna(p_aktor uuid, p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin public.pengguna;
  l public.pengguna;
  v_akt jsonb;
begin
  v_admin := app.wajib_admin(p_aktor);
  select * into l from public.pengguna where id = p_id and deleted_at is null for update;
  if l.id is null then raise exception 'Pengguna tidak ditemukan'; end if;
  if p_id = v_admin.id then raise exception 'Akun Anda sendiri tidak bisa dihapus'; end if;
  if l.peran = 'Administrator' and l.aktif
     and (select count(*) from public.pengguna where peran = 'Administrator' and aktif and deleted_at is null) <= 1 then
    raise exception 'Minimal harus ada satu Administrator aktif';
  end if;
  -- profil disimpan (nonaktif) agar riwayat & pengajuan buatannya tetap terbaca
  update public.pengguna set aktif = false, deleted_at = now() where id = p_id;
  v_akt := app.catat(v_admin.id, 'Pengguna', 'Pengguna', 'menghapus pengguna', l.id::text, l.nama, null, l.peran || ' · ' || l.email);
  return jsonb_build_object('authId', l.auth_id, 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

create or replace function public.admin_catat_sandi(p_aktor uuid, p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin public.pengguna;
  l public.pengguna;
begin
  v_admin := app.wajib_admin(p_aktor);
  select * into l from public.pengguna where id = p_id and deleted_at is null;
  if l.id is null then raise exception 'Pengguna tidak ditemukan'; end if;
  return jsonb_build_object('authId', l.auth_id, 'aktivitas', jsonb_build_array(
    app.catat(v_admin.id, 'Pengguna', 'Pengguna', 'mengatur ulang kata sandi', l.id::text, l.nama)));
end;
$$;

-- ---------------------------------------------------------------------
-- 12. Hak akses (GRANT) — API hanya boleh membaca lewat RLS dan memanggil RPC
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.izin_peran, public.unit_kerja, public.sumber_dana, public.akun, public.penyedia, public.pengguna,
  public.pengajuan, public.spp, public.sp3b, public.pengesahan, public.aktivitas,
  public.pok_unggahan, public.pok_uraian, public.pok_mak, public.pok_item, public.v_pengajuan
to authenticated;
grant all on all tables in schema public to service_role;
revoke all on app.nomor_urut from public, anon, authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function
  public.buat_pengajuan(jsonb), public.ubah_pengajuan(text, jsonb, text), public.hapus_pengajuan(text, text),
  public.ubah_status_pengajuan(text, text, text), public.buat_spp(text, text, date), public.majukan_tahap_spp(text),
  public.sahkan_pengajuan(text[]), public.catat_aktivitas(text, text, text, text, text), public.jejak_dokumen(text),
  public.simpan_referensi(text, jsonb, text), public.terapkan_pok(jsonb, text, text), public.pok_aktif(integer)
to authenticated;
grant execute on function
  public.admin_tambah_pengguna(uuid, uuid, text, text, text, text),
  public.admin_ubah_pengguna(uuid, uuid, text, text, text, text, boolean),
  public.admin_hapus_pengguna(uuid, uuid), public.admin_catat_sandi(uuid, uuid)
to service_role;
-- fungsi yang dipakai di dalam kebijakan RLS
grant execute on function app.aktif_saya(), app.id_saya(), app.unit_saya(), app.punya_izin(text), app.json_aktivitas(public.aktivitas) to authenticated;
grant execute on all functions in schema app to service_role;

-- ---------------------------------------------------------------------
-- 13. Storage: file asli FA Detail (privat)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fa-detail', 'fa-detail', false, 20971520,
        array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'])
on conflict (id) do nothing;

create policy "fa-detail: unggah oleh admin & operator" on storage.objects for insert to authenticated
  with check (bucket_id = 'fa-detail' and (select app.punya_izin('pok.unggah')));
create policy "fa-detail: dibaca pengguna aktif" on storage.objects for select to authenticated
  using (bucket_id = 'fa-detail' and (select app.aktif_saya()));
create policy "fa-detail: hapus unggahan sendiri" on storage.objects for delete to authenticated
  using (bucket_id = 'fa-detail' and owner_id = (select auth.uid()::text) and (select app.punya_izin('pok.unggah')));

-- ---------------------------------------------------------------------
-- 14. Realtime: perubahan data langsung tampil di browser pengguna lain
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table
  public.pengajuan, public.spp, public.pengesahan, public.aktivitas, public.pok_unggahan,
  public.pengguna, public.unit_kerja, public.penyedia, public.akun, public.sumber_dana;
