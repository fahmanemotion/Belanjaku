-- =====================================================================
-- BELANJAKU — alur baru: Belanja (pengadaan) → Pencairan (rekap) → Pengesahan (rekap)
--
-- • Belanja    : bagian pengadaan barang/jasa mencatat dokumen belanja untuk unit kerja mana pun.
--                Dokumen langsung masuk daftar Pencairan (tanpa alur verifikasi/persetujuan).
-- • Pencairan  : operator keuangan mencentang belanja → "Cairkan" → terbentuk Rekap Pencairan
--                (CAIR-YYYY-NNNN); belanja keluar dari daftar dan tercatat di riwayat rekap.
-- • Pengesahan : belanja yang sudah dicairkan dicentang → "Sahkan" → Rekap Pengesahan (SAH-YYYY-NNNN).
-- • Status belanja diturunkan dari rekap: Belum dicairkan → Dicairkan → Disahkan.
-- • Satu rekap = satu sumber dana (RM atau BLU). Rekap dapat dibatalkan dengan alasan;
--   rekap pencairan hanya bisa dibatalkan bila belum ada belanjanya yang disahkan.
-- • Peran: Operator Unit → Operator Pengadaan (semua unit); peran baru Operator Keuangan.
--   PPK & PPSPM memantau (lihat saja).
--
-- Tabel alur lama (spp, sp3b, pengesahan) dihapus; migrasi berhenti bila tabel itu sudah berisi data.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Pengaman: jangan menghapus data alur lama
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from public.spp) or exists (select 1 from public.pengesahan) or exists (select 1 from public.sp3b) then
    raise exception 'Tabel spp/pengesahan/sp3b sudah berisi data; migrasi dihentikan agar data tidak hilang';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Objek alur lama (SPP → SPM → SP2D, SP3B per bulan, status persetujuan)
-- ---------------------------------------------------------------------
drop function if exists public.ubah_status_pengajuan(text, text, text);
drop function if exists public.buat_spp(text, text, date);
drop function if exists public.majukan_tahap_spp(text);
drop function if exists public.sahkan_pengajuan(text[]);
drop view if exists public.v_pengajuan;
drop table if exists public.pengesahan;
drop table if exists public.spp;
drop table if exists public.sp3b;
alter table public.pengajuan drop column if exists status;

-- ---------------------------------------------------------------------
-- 2. Peran & izin
-- ---------------------------------------------------------------------
alter table public.izin_peran drop constraint if exists izin_peran_peran_check;
alter table public.pengguna drop constraint if exists pengguna_peran_check;
alter table public.pengguna drop constraint if exists operator_wajib_unit;
update public.pengguna set peran = 'Operator Pengadaan' where peran = 'Operator Unit';
delete from public.izin_peran;
alter table public.izin_peran add constraint izin_peran_peran_check
  check (peran in ('Administrator', 'Operator Pengadaan', 'Operator Keuangan', 'Bendahara Pengeluaran', 'PPK', 'PPSPM'));
alter table public.pengguna add constraint pengguna_peran_check
  check (peran in ('Administrator', 'Operator Pengadaan', 'Operator Keuangan', 'Bendahara Pengeluaran', 'PPK', 'PPSPM'));

insert into public.izin_peran (peran, izin) values
  ('Administrator', 'belanja.buat'), ('Administrator', 'belanja.lihatSemua'), ('Administrator', 'aktivitas.semua'),
  ('Administrator', 'referensi.kelola'), ('Administrator', 'pengguna.kelola'), ('Administrator', 'pok.unggah'),
  ('Operator Pengadaan', 'belanja.buat'), ('Operator Pengadaan', 'belanja.lihatSemua'), ('Operator Pengadaan', 'pok.unggah'),
  ('Operator Keuangan', 'belanja.lihatSemua'), ('Operator Keuangan', 'pencairan.rekap'),
  ('Operator Keuangan', 'pengesahan.sahkan'), ('Operator Keuangan', 'aktivitas.semua'),
  ('Bendahara Pengeluaran', 'belanja.lihatSemua'), ('Bendahara Pengeluaran', 'pencairan.rekap'),
  ('Bendahara Pengeluaran', 'pengesahan.sahkan'), ('Bendahara Pengeluaran', 'aktivitas.semua'),
  ('PPK', 'belanja.lihatSemua'), ('PPK', 'aktivitas.semua'),
  ('PPSPM', 'belanja.lihatSemua'), ('PPSPM', 'aktivitas.semua');

-- ---------------------------------------------------------------------
-- 3. Nomor urut rekap (per tahun, tidak dipakai ulang)
-- ---------------------------------------------------------------------
alter table app.nomor_urut drop constraint if exists nomor_urut_jenis_check;
alter table app.nomor_urut add constraint nomor_urut_jenis_check check (jenis in ('pengajuan', 'pencairan', 'pengesahan'));

-- ---------------------------------------------------------------------
-- 4. Rekap pencairan & pengesahan
-- ---------------------------------------------------------------------
create table public.rekap_pencairan (
  nomor        text primary key check (nomor ~ '^CAIR-[0-9]{4}-[0-9]{4,}$'),
  tanggal      date not null,
  dana         text not null references public.sumber_dana (kode) check (dana in ('RM', 'BLU')),
  jenis        text not null check (jenis in ('LS', 'GU', 'TUP')),
  referensi    text check (length(referensi) <= 100),
  catatan      text check (length(catatan) <= 500),
  jumlah       integer not null check (jumlah > 0),
  total        bigint not null check (total > 0),
  dibuat_oleh  uuid not null references public.pengguna (id),
  created_at   timestamptz not null default now()
);
comment on table public.rekap_pencairan is 'Rekap belanja yang dicairkan/dibayarkan sekaligus oleh operator keuangan (satu sumber dana per rekap).';

create table public.rekap_pengesahan (
  nomor        text primary key check (nomor ~ '^SAH-[0-9]{4}-[0-9]{4,}$'),
  tanggal      date not null,
  dana         text not null references public.sumber_dana (kode) check (dana in ('RM', 'BLU')),
  referensi    text check (length(referensi) <= 100),
  catatan      text check (length(catatan) <= 500),
  jumlah       integer not null check (jumlah > 0),
  total        bigint not null check (total > 0),
  dibuat_oleh  uuid not null references public.pengguna (id),
  created_at   timestamptz not null default now()
);
comment on table public.rekap_pengesahan is 'Rekap belanja yang sudah dicairkan lalu disahkan (SP3B BLU / pertanggungjawaban RM).';

alter table public.pengajuan
  add column pencairan_nomor text references public.rekap_pencairan (nomor),
  add column pengesahan_nomor text references public.rekap_pengesahan (nomor),
  add constraint sahkan_setelah_cair check (pengesahan_nomor is null or pencairan_nomor is not null);

create index pengajuan_pencairan_idx on public.pengajuan (pencairan_nomor);
create index pengajuan_pengesahan_idx on public.pengajuan (pengesahan_nomor);
create index rekap_pencairan_tanggal_idx on public.rekap_pencairan (tanggal desc);
create index rekap_pencairan_dana_idx on public.rekap_pencairan (dana);
create index rekap_pencairan_oleh_idx on public.rekap_pencairan (dibuat_oleh);
create index rekap_pengesahan_tanggal_idx on public.rekap_pengesahan (tanggal desc);
create index rekap_pengesahan_dana_idx on public.rekap_pengesahan (dana);
create index rekap_pengesahan_oleh_idx on public.rekap_pengesahan (dibuat_oleh);

-- ---------------------------------------------------------------------
-- 5. View baca (RLS tabel dasar tetap berlaku: security_invoker)
-- ---------------------------------------------------------------------
create view public.v_pengajuan with (security_invoker = true) as
select
  k.id, k.uraian, k.no_dokumen, k.jenis_dokumen, k.penyedia_id, pv.nama as penyedia,
  k.dana, k.mak, k.akun, k.unit, k.nilai, k.tanggal, k.dibuat_oleh,
  case when k.pengesahan_nomor is not null then 'Disahkan'
       when k.pencairan_nomor is not null then 'Dicairkan'
       else 'Belum dicairkan' end as status,
  k.pencairan_nomor, rp.tanggal as pencairan_tanggal, rp.jenis as pencairan_jenis,
  k.pengesahan_nomor, rs.tanggal as pengesahan_tanggal,
  k.created_at, k.updated_at
from public.pengajuan k
join public.penyedia pv on pv.id = k.penyedia_id
left join public.rekap_pencairan rp on rp.nomor = k.pencairan_nomor
left join public.rekap_pengesahan rs on rs.nomor = k.pengesahan_nomor
where k.deleted_at is null;

-- ---------------------------------------------------------------------
-- 6. Fungsi bantu
-- ---------------------------------------------------------------------
-- Bentuk JSON satu belanja (sama dengan tipe Kegiatan di lib/types.ts)
create or replace function app.json_pengajuan(p_id text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', k.id, 'uraian', k.uraian, 'noDokumen', k.no_dokumen, 'jenisDokumen', k.jenis_dokumen,
    'penyediaId', k.penyedia_id, 'penyedia', pv.nama, 'dana', k.dana, 'mak', k.mak, 'akun', k.akun,
    'unit', k.unit, 'nilai', k.nilai, 'tanggal', to_char(k.tanggal, 'YYYY-MM-DD'),
    'status', case when k.pengesahan_nomor is not null then 'Disahkan'
                   when k.pencairan_nomor is not null then 'Dicairkan' else 'Belum dicairkan' end,
    'dibuatOleh', k.dibuat_oleh,
    'pencairan', case when rp.nomor is null then null else jsonb_build_object(
      'nomor', rp.nomor, 'tanggal', to_char(rp.tanggal, 'YYYY-MM-DD'), 'jenis', rp.jenis) end,
    'pengesahan', case when rs.nomor is null then null else jsonb_build_object(
      'nomor', rs.nomor, 'tanggal', to_char(rs.tanggal, 'YYYY-MM-DD')) end
  ))
  from public.pengajuan k
  join public.penyedia pv on pv.id = k.penyedia_id
  left join public.rekap_pencairan rp on rp.nomor = k.pencairan_nomor
  left join public.rekap_pengesahan rs on rs.nomor = k.pengesahan_nomor
  where k.id = p_id
$$;

-- Bentuk JSON satu rekap (sama dengan tipe Rekap di lib/types.ts)
create or replace function app.json_rekap(p_jenis text, p_nomor text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'nomor', r.nomor, 'jenisRekap', 'pencairan', 'tanggal', to_char(r.tanggal, 'YYYY-MM-DD'), 'dana', r.dana,
    'jenisBayar', r.jenis, 'referensi', r.referensi, 'catatan', r.catatan, 'jumlah', r.jumlah, 'total', r.total,
    'dibuatOleh', r.dibuat_oleh, 'dibuatPada', to_char(r.created_at at time zone 'Asia/Makassar', 'YYYY-MM-DD"T"HH24:MI:SS')))
  from public.rekap_pencairan r where p_jenis = 'pencairan' and r.nomor = p_nomor
  union all
  select jsonb_strip_nulls(jsonb_build_object(
    'nomor', r.nomor, 'jenisRekap', 'pengesahan', 'tanggal', to_char(r.tanggal, 'YYYY-MM-DD'), 'dana', r.dana,
    'referensi', r.referensi, 'catatan', r.catatan, 'jumlah', r.jumlah, 'total', r.total,
    'dibuatOleh', r.dibuat_oleh, 'dibuatPada', to_char(r.created_at at time zone 'Asia/Makassar', 'YYYY-MM-DD"T"HH24:MI:SS')))
  from public.rekap_pengesahan r where p_jenis = 'pengesahan' and r.nomor = p_nomor
$$;

-- Validasi isi dokumen belanja (dipakai saat catat & ubah)
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
    raise exception 'Peran Anda hanya dapat mencatat belanja untuk unitnya sendiri';
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

-- Hanya pencatat dokumen; dokumen belum dicairkan
create or replace function app.wajib_pemilik(p_id text, v_saya public.pengguna, p_aksi text)
returns public.pengajuan language plpgsql volatile security definer set search_path = ''
as $$
declare k public.pengajuan;
begin
  select * into k from public.pengajuan where id = p_id and deleted_at is null for update;
  if k.id is null then raise exception 'Dokumen belanja % tidak ditemukan', p_id; end if;
  if k.dibuat_oleh <> v_saya.id then
    raise exception 'Hanya % (pencatat dokumen) yang dapat % %',
      (select nama from public.pengguna where id = k.dibuat_oleh), p_aksi, p_id using errcode = '42501';
  end if;
  if k.pencairan_nomor is not null then
    raise exception '% sudah dicairkan pada % sehingga tidak bisa diubah atau dihapus', p_id, k.pencairan_nomor;
  end if;
  return k;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. RPC — Belanja
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
  v_saya := app.wajib_izin('belanja.buat', 'mencatat dokumen belanja');
  perform app.periksa_isi_pengajuan(p_data, v_saya);
  v_id := 'BLJ-' || v_tahun || '-' || lpad(app.nomor_berikut('pengajuan', v_tahun)::text, 4, '0');
  insert into public.pengajuan (id, uraian, jenis_dokumen, no_dokumen, penyedia_id, unit, dana, mak, nilai, tanggal, dibuat_oleh)
  values (v_id, btrim(p_data->>'uraian'), p_data->>'jenisDokumen', btrim(p_data->>'noDokumen'), (p_data->>'penyediaId')::uuid,
          p_data->>'unit', p_data->>'dana', btrim(p_data->>'mak'), (p_data->>'nilai')::bigint, (p_data->>'tanggal')::date, v_saya.id);
  v_akt := app.catat(v_saya.id, 'Buat', 'Belanja', 'mencatat dokumen belanja', v_id, btrim(p_data->>'uraian'), null,
                     (p_data->>'jenisDokumen') || ' · ' || app.rupiah((p_data->>'nilai')::bigint) || ' · MAK ' || btrim(p_data->>'mak'),
                     p_data->>'unit');
  return jsonb_build_object('pengajuan', app.json_pengajuan(v_id), 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

create or replace function public.ubah_pengajuan(p_id text, p_data jsonb, p_catatan text default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  k public.pengajuan;
  v_ubah jsonb := '[]'::jsonb;
  v_akt jsonb;
  v_peny_lama text; v_peny_baru text;
  v_unit_lama text; v_unit_baru text;
  v_akun_baru text := right(btrim(p_data->>'mak'), 6);
begin
  v_saya := app.wajib_izin('belanja.buat', 'mengubah dokumen belanja');
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
    return jsonb_build_object('berubah', 0, 'pengajuan', app.json_pengajuan(p_id), 'aktivitas', '[]'::jsonb);
  end if;

  update public.pengajuan set
    uraian = btrim(p_data->>'uraian'), jenis_dokumen = p_data->>'jenisDokumen', no_dokumen = btrim(p_data->>'noDokumen'),
    penyedia_id = (p_data->>'penyediaId')::uuid, unit = p_data->>'unit', dana = p_data->>'dana', mak = btrim(p_data->>'mak'),
    nilai = (p_data->>'nilai')::bigint, tanggal = (p_data->>'tanggal')::date
  where id = p_id;

  v_akt := app.catat(v_saya.id, 'Ubah', 'Belanja', 'mengubah dokumen belanja', p_id, btrim(p_data->>'uraian'), v_ubah, p_catatan, p_data->>'unit');
  return jsonb_build_object('berubah', jsonb_array_length(v_ubah), 'pengajuan', app.json_pengajuan(p_id), 'aktivitas', jsonb_build_array(v_akt));
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
  v_saya := app.wajib_izin('belanja.buat', 'menghapus dokumen belanja');
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Tuliskan alasan penghapusan (minimal 5 karakter)'; end if;
  k := app.wajib_pemilik(p_id, v_saya, 'mengubah atau menghapus');
  update public.pengajuan set deleted_at = now(), dihapus_oleh = v_saya.id, alasan_hapus = btrim(p_alasan) where id = p_id;
  -- isi dokumen disimpan di log agar tetap bisa ditelusuri setelah dihapus
  v_akt := app.catat(v_saya.id, 'Hapus', 'Belanja', 'menghapus dokumen belanja', p_id, k.uraian,
    jsonb_build_array(
      app.ubah('No. dokumen', k.jenis_dokumen || ' ' || k.no_dokumen, 'dihapus'),
      app.ubah('Penyedia', (select nama from public.penyedia where id = k.penyedia_id), 'dihapus'),
      app.ubah('MAK', k.mak, 'dihapus'),
      app.ubah('Akun', k.akun || ' ' || coalesce((select uraian from public.akun where kode = k.akun), '-'), 'dihapus'),
      app.ubah('Nilai', app.rupiah(k.nilai), 'dihapus')
    ),
    p_alasan, k.unit);
  return jsonb_build_object('aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- ---------------------------------------------------------------------
-- 8. RPC — Rekap pencairan
-- ---------------------------------------------------------------------
create or replace function public.buat_rekap_pencairan(
  p_ids text[], p_tanggal date, p_jenis text, p_referensi text default null, p_catatan text default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  v_ids text[];
  v_dana text[];
  v_jumlah int;
  v_total bigint;
  v_tahun smallint;
  v_nomor text;
  v_ref text := nullif(btrim(coalesce(p_referensi, '')), '');
  k public.pengajuan;
  v_akt jsonb := '[]'::jsonb;
  v_hasil jsonb := '[]'::jsonb;
begin
  v_saya := app.wajib_izin('pencairan.rekap', 'mencairkan belanja');
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Pilih minimal satu belanja'; end if;
  if p_tanggal is null then raise exception 'Tanggal pencairan wajib diisi'; end if;
  if coalesce(p_jenis, '') not in ('LS', 'GU', 'TUP') then raise exception 'Jenis pembayaran harus LS, GU, atau TUP'; end if;
  if length(coalesce(v_ref, '')) > 100 then raise exception 'Nomor referensi maksimal 100 karakter'; end if;
  if length(coalesce(p_catatan, '')) > 500 then raise exception 'Catatan maksimal 500 karakter'; end if;
  select array_agg(distinct x) into v_ids from unnest(p_ids) x;
  -- kunci baris terpilih agar belanja yang sama tidak dicairkan dua kali bersamaan
  perform 1 from public.pengajuan where id = any(v_ids) and deleted_at is null for update;
  if (select count(*) from public.pengajuan where id = any(v_ids) and deleted_at is null) <> cardinality(v_ids) then
    raise exception 'Sebagian belanja tidak ditemukan atau sudah dihapus. Muat ulang halaman lalu coba lagi.';
  end if;
  if exists (select 1 from public.pengajuan where id = any(v_ids) and pencairan_nomor is not null) then
    raise exception 'Belanja berikut sudah dicairkan: %',
      (select string_agg(id || ' (' || pencairan_nomor || ')', ', ' order by id) from public.pengajuan where id = any(v_ids) and pencairan_nomor is not null);
  end if;
  select array_agg(distinct dana), count(*), sum(nilai) into v_dana, v_jumlah, v_total from public.pengajuan where id = any(v_ids);
  if cardinality(v_dana) > 1 then
    raise exception 'Satu rekap pencairan hanya untuk satu sumber dana. Pilih belanja RM saja atau BLU saja.';
  end if;

  v_tahun := extract(year from p_tanggal)::smallint;
  v_nomor := 'CAIR-' || v_tahun || '-' || lpad(app.nomor_berikut('pencairan', v_tahun)::text, 4, '0');
  insert into public.rekap_pencairan (nomor, tanggal, dana, jenis, referensi, catatan, jumlah, total, dibuat_oleh)
  values (v_nomor, p_tanggal, v_dana[1], p_jenis, v_ref, nullif(btrim(coalesce(p_catatan, '')), ''), v_jumlah, v_total, v_saya.id);
  update public.pengajuan set pencairan_nomor = v_nomor where id = any(v_ids);

  v_akt := v_akt || app.catat(v_saya.id, 'Pencairan', 'Pencairan', 'membuat rekap pencairan', v_nomor,
    'Rekap pencairan ' || v_dana[1] || ' · ' || v_jumlah || ' belanja', null,
    p_jenis || ' · ' || app.tgl(p_tanggal) || ' · ' || app.rupiah(v_total) || coalesce(' · No. ' || v_ref, ''), null);
  for k in select * from public.pengajuan where id = any(v_ids) order by id loop
    v_akt := v_akt || app.catat(v_saya.id, 'Pencairan', 'Pencairan', 'mencairkan pada ' || v_nomor, k.id, k.uraian, null,
                                p_jenis || ' · ' || app.rupiah(k.nilai), k.unit);
    v_hasil := v_hasil || app.json_pengajuan(k.id);
  end loop;
  return jsonb_build_object('rekap', app.json_rekap('pencairan', v_nomor), 'pengajuan', v_hasil, 'aktivitas', v_akt);
end;
$$;

create or replace function public.batal_rekap_pencairan(p_nomor text, p_alasan text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  r public.rekap_pencairan;
  v_ids text[];
  k public.pengajuan;
  v_akt jsonb := '[]'::jsonb;
  v_hasil jsonb := '[]'::jsonb;
begin
  v_saya := app.wajib_izin('pencairan.rekap', 'membatalkan rekap pencairan');
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Tuliskan alasan pembatalan (minimal 5 karakter)'; end if;
  select * into r from public.rekap_pencairan where nomor = p_nomor for update;
  if r.nomor is null then raise exception 'Rekap % tidak ditemukan', p_nomor; end if;
  perform 1 from public.pengajuan where pencairan_nomor = p_nomor for update;
  if exists (select 1 from public.pengajuan where pencairan_nomor = p_nomor and pengesahan_nomor is not null) then
    raise exception 'Rekap % tidak bisa dibatalkan karena sebagian belanjanya sudah disahkan (%). Batalkan rekap pengesahannya terlebih dahulu.',
      p_nomor, (select string_agg(distinct pengesahan_nomor, ', ') from public.pengajuan where pencairan_nomor = p_nomor and pengesahan_nomor is not null);
  end if;
  select array_agg(id order by id) into v_ids from public.pengajuan where pencairan_nomor = p_nomor;
  update public.pengajuan set pencairan_nomor = null where pencairan_nomor = p_nomor;
  delete from public.rekap_pencairan where nomor = p_nomor;

  v_akt := v_akt || app.catat(v_saya.id, 'Pencairan', 'Pencairan', 'membatalkan rekap pencairan', p_nomor,
    'Rekap pencairan ' || r.dana || ' · ' || r.jumlah || ' belanja',
    jsonb_build_array(
      app.ubah('Belanja', array_to_string(v_ids, ', '), 'kembali ke daftar pencairan'),
      app.ubah('Total', app.rupiah(r.total), 'dibatalkan')),
    p_alasan, null);
  for k in select * from public.pengajuan where id = any(v_ids) order by id loop
    v_akt := v_akt || app.catat(v_saya.id, 'Pencairan', 'Pencairan', 'dikeluarkan dari ' || p_nomor || ' (rekap dibatalkan)', k.id, k.uraian,
                                null, p_alasan, k.unit);
    v_hasil := v_hasil || app.json_pengajuan(k.id);
  end loop;
  return jsonb_build_object('pengajuan', v_hasil, 'aktivitas', v_akt);
end;
$$;

-- ---------------------------------------------------------------------
-- 9. RPC — Rekap pengesahan
-- ---------------------------------------------------------------------
create or replace function public.buat_rekap_pengesahan(
  p_ids text[], p_tanggal date, p_referensi text default null, p_catatan text default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  v_ids text[];
  v_dana text[];
  v_jumlah int;
  v_total bigint;
  v_cair_akhir date;
  v_tahun smallint;
  v_nomor text;
  v_ref text := nullif(btrim(coalesce(p_referensi, '')), '');
  k public.pengajuan;
  v_akt jsonb := '[]'::jsonb;
  v_hasil jsonb := '[]'::jsonb;
begin
  v_saya := app.wajib_izin('pengesahan.sahkan', 'mengesahkan belanja');
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Pilih minimal satu belanja'; end if;
  if p_tanggal is null then raise exception 'Tanggal pengesahan wajib diisi'; end if;
  if length(coalesce(v_ref, '')) > 100 then raise exception 'Nomor referensi maksimal 100 karakter'; end if;
  if length(coalesce(p_catatan, '')) > 500 then raise exception 'Catatan maksimal 500 karakter'; end if;
  select array_agg(distinct x) into v_ids from unnest(p_ids) x;
  perform 1 from public.pengajuan where id = any(v_ids) and deleted_at is null for update;
  if (select count(*) from public.pengajuan where id = any(v_ids) and deleted_at is null) <> cardinality(v_ids) then
    raise exception 'Sebagian belanja tidak ditemukan atau sudah dihapus. Muat ulang halaman lalu coba lagi.';
  end if;
  if exists (select 1 from public.pengajuan where id = any(v_ids) and pencairan_nomor is null) then
    raise exception 'Belanja berikut belum dicairkan: %',
      (select string_agg(id, ', ' order by id) from public.pengajuan where id = any(v_ids) and pencairan_nomor is null);
  end if;
  if exists (select 1 from public.pengajuan where id = any(v_ids) and pengesahan_nomor is not null) then
    raise exception 'Belanja berikut sudah disahkan: %',
      (select string_agg(id || ' (' || pengesahan_nomor || ')', ', ' order by id) from public.pengajuan where id = any(v_ids) and pengesahan_nomor is not null);
  end if;
  select array_agg(distinct k2.dana), count(*), sum(k2.nilai), max(rp.tanggal)
    into v_dana, v_jumlah, v_total, v_cair_akhir
  from public.pengajuan k2 join public.rekap_pencairan rp on rp.nomor = k2.pencairan_nomor
  where k2.id = any(v_ids);
  if cardinality(v_dana) > 1 then
    raise exception 'Satu rekap pengesahan hanya untuk satu sumber dana. Pilih belanja RM saja atau BLU saja.';
  end if;
  if p_tanggal < v_cair_akhir then
    raise exception 'Tanggal pengesahan tidak boleh sebelum tanggal pencairan (%)', app.tgl(v_cair_akhir);
  end if;

  v_tahun := extract(year from p_tanggal)::smallint;
  v_nomor := 'SAH-' || v_tahun || '-' || lpad(app.nomor_berikut('pengesahan', v_tahun)::text, 4, '0');
  insert into public.rekap_pengesahan (nomor, tanggal, dana, referensi, catatan, jumlah, total, dibuat_oleh)
  values (v_nomor, p_tanggal, v_dana[1], v_ref, nullif(btrim(coalesce(p_catatan, '')), ''), v_jumlah, v_total, v_saya.id);
  update public.pengajuan set pengesahan_nomor = v_nomor where id = any(v_ids);

  v_akt := v_akt || app.catat(v_saya.id, 'Pengesahan', 'Pengesahan', 'membuat rekap pengesahan', v_nomor,
    'Rekap pengesahan ' || v_dana[1] || ' · ' || v_jumlah || ' belanja', null,
    app.tgl(p_tanggal) || ' · ' || app.rupiah(v_total) || coalesce(' · No. ' || v_ref, ''), null);
  for k in select * from public.pengajuan where id = any(v_ids) order by id loop
    v_akt := v_akt || app.catat(v_saya.id, 'Pengesahan', 'Pengesahan', 'mengesahkan pada ' || v_nomor, k.id, k.uraian, null,
                                app.rupiah(k.nilai), k.unit);
    v_hasil := v_hasil || app.json_pengajuan(k.id);
  end loop;
  return jsonb_build_object('rekap', app.json_rekap('pengesahan', v_nomor), 'pengajuan', v_hasil, 'aktivitas', v_akt);
end;
$$;

create or replace function public.batal_rekap_pengesahan(p_nomor text, p_alasan text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  r public.rekap_pengesahan;
  v_ids text[];
  k public.pengajuan;
  v_akt jsonb := '[]'::jsonb;
  v_hasil jsonb := '[]'::jsonb;
begin
  v_saya := app.wajib_izin('pengesahan.sahkan', 'membatalkan rekap pengesahan');
  if length(btrim(coalesce(p_alasan, ''))) < 5 then raise exception 'Tuliskan alasan pembatalan (minimal 5 karakter)'; end if;
  select * into r from public.rekap_pengesahan where nomor = p_nomor for update;
  if r.nomor is null then raise exception 'Rekap % tidak ditemukan', p_nomor; end if;
  perform 1 from public.pengajuan where pengesahan_nomor = p_nomor for update;
  select array_agg(id order by id) into v_ids from public.pengajuan where pengesahan_nomor = p_nomor;
  update public.pengajuan set pengesahan_nomor = null where pengesahan_nomor = p_nomor;
  delete from public.rekap_pengesahan where nomor = p_nomor;

  v_akt := v_akt || app.catat(v_saya.id, 'Pengesahan', 'Pengesahan', 'membatalkan rekap pengesahan', p_nomor,
    'Rekap pengesahan ' || r.dana || ' · ' || r.jumlah || ' belanja',
    jsonb_build_array(
      app.ubah('Belanja', array_to_string(v_ids, ', '), 'kembali ke daftar pengesahan'),
      app.ubah('Total', app.rupiah(r.total), 'dibatalkan')),
    p_alasan, null);
  for k in select * from public.pengajuan where id = any(v_ids) order by id loop
    v_akt := v_akt || app.catat(v_saya.id, 'Pengesahan', 'Pengesahan', 'dikeluarkan dari ' || p_nomor || ' (rekap dibatalkan)', k.id, k.uraian,
                                null, p_alasan, k.unit);
    v_hasil := v_hasil || app.json_pengajuan(k.id);
  end loop;
  return jsonb_build_object('pengajuan', v_hasil, 'aktivitas', v_akt);
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Kelola pengguna (pesan galat menyesuaikan peran baru)
-- ---------------------------------------------------------------------
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
  when check_violation then raise exception 'Data pengguna tidak valid (periksa nama, email, dan peran)';
end;
$$;

-- ---------------------------------------------------------------------
-- 11. RLS
-- ---------------------------------------------------------------------
alter table public.rekap_pencairan enable row level security;
alter table public.rekap_pengesahan enable row level security;
create policy "pengguna aktif membaca rekap pencairan" on public.rekap_pencairan for select to authenticated using ((select app.aktif_saya()));
create policy "pengguna aktif membaca rekap pengesahan" on public.rekap_pengesahan for select to authenticated using ((select app.aktif_saya()));

-- Tanpa izin "aktivitas.semua": aktivitas sendiri + aktivitas dokumen belanja yang boleh dilihat
drop policy if exists "membaca aktivitas" on public.aktivitas;
create policy "membaca aktivitas" on public.aktivitas for select to authenticated
  using (
    (select app.aktif_saya())
    and (
      (select app.punya_izin('aktivitas.semua'))
      or oleh = (select app.id_saya())
      or (modul in ('Belanja', 'Pencairan', 'Pengesahan') and (select app.punya_izin('belanja.lihatSemua')))
      or (unit is not null and unit = (select app.unit_saya()))
    )
  );

-- ---------------------------------------------------------------------
-- 12. Hak akses (GRANT)
-- ---------------------------------------------------------------------
revoke all on public.rekap_pencairan, public.rekap_pengesahan, public.v_pengajuan from anon, authenticated;
grant select on public.rekap_pencairan, public.rekap_pengesahan, public.v_pengajuan to authenticated;
grant all on public.rekap_pencairan, public.rekap_pengesahan, public.v_pengajuan to service_role;

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function
  public.buat_pengajuan(jsonb), public.ubah_pengajuan(text, jsonb, text), public.hapus_pengajuan(text, text),
  public.buat_rekap_pencairan(text[], date, text, text, text), public.batal_rekap_pencairan(text, text),
  public.buat_rekap_pengesahan(text[], date, text, text), public.batal_rekap_pengesahan(text, text),
  public.catat_aktivitas(text, text, text, text, text), public.jejak_dokumen(text),
  public.simpan_referensi(text, jsonb, text), public.terapkan_pok(jsonb, text, text), public.pok_aktif(integer)
to authenticated;
grant execute on function
  public.admin_tambah_pengguna(uuid, uuid, text, text, text, text),
  public.admin_ubah_pengguna(uuid, uuid, text, text, text, text, boolean),
  public.admin_hapus_pengguna(uuid, uuid), public.admin_catat_sandi(uuid, uuid)
to service_role;
grant execute on function app.aktif_saya(), app.id_saya(), app.unit_saya(), app.punya_izin(text), app.json_aktivitas(public.aktivitas) to authenticated;
grant execute on all functions in schema app to service_role;

-- ---------------------------------------------------------------------
-- 13. Realtime
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.rekap_pencairan, public.rekap_pengesahan;
