-- =====================================================================
-- BELANJAKU — Modul Pengadaan: alur dokumen Kwitansi
--
-- Alur (sesuai berkas NODIN_KWITANSI.xlsx, sheet pertama s.d. terakhir):
--   1. PPK               : Nota Dinas Perintah Pengadaan Barang/Jasa + HPS (Daftar Paket Pekerjaan)
--   2. Pejabat Pengadaan : Surat Pesanan kepada penyedia / pihak ketiga
--   3. Pejabat Pengadaan : Nota / Bukti Pembelian dari penyedia
--   4. PPK               : Kwitansi + lampiran, BAP + lampiran, BAST + lampiran
--                          → otomatis menjadi dokumen belanja jenis Kwitansi di Daftar Pencairan
-- • Satu tahap bisa diubah selama tahap berikutnya belum terbit. Tahap terakhir dapat dibatalkan
--   (dengan alasan) oleh pelakunya agar tahap sebelumnya bisa diperbaiki; isiannya tetap tersimpan.
-- • Kwitansi yang sudah dicairkan tidak bisa diubah atau dibatalkan.
-- • Data penanda tangan (NIP, pangkat, SK PPK) disimpan di tabel pengguna; data pembayaran penyedia
--   (pimpinan, alamat, NPWP, bank, rekening) di tabel penyedia. Saat kwitansi terbit salinannya
--   disimpan di paket (kolom arsip) agar dokumen lama tidak berubah bila referensi diubah.
-- • Perbaikan: aktivitas cetak lembar belanja kini tercatat (sebelumnya ditolak "Aksi cetak tidak dikenal").
--
-- Izin baru : pengadaan.ppk (PPK, Administrator) · pengadaan.pp (Pejabat Pengadaan, Administrator)
-- Jalankan sekali setelah 20261019160000_peran_baru_tanpa_unit.sql (aman dijalankan ulang).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Izin, nomor urut, modul aktivitas
-- ---------------------------------------------------------------------
insert into public.izin_peran (peran, izin) values
  ('Administrator', 'pengadaan.ppk'), ('Administrator', 'pengadaan.pp'),
  ('PPK', 'pengadaan.ppk'), ('Pejabat Pengadaan', 'pengadaan.pp')
on conflict do nothing;

alter table app.nomor_urut drop constraint if exists nomor_urut_jenis_check;
alter table app.nomor_urut add constraint nomor_urut_jenis_check
  check (jenis in ('pengajuan', 'pencairan', 'pengesahan', 'paket'));

alter table public.aktivitas drop constraint if exists aktivitas_modul_check;
alter table public.aktivitas add constraint aktivitas_modul_check
  check (modul in ('Belanja', 'Pengadaan', 'Pencairan', 'Pengesahan', 'Pengguna', 'Referensi', 'Sistem'));

-- ---------------------------------------------------------------------
-- 2. Data penanda tangan (pengguna) & data pembayaran (penyedia)
-- ---------------------------------------------------------------------
alter table public.pengguna
  add column if not exists nip text,
  add column if not exists pangkat text,
  add column if not exists sk_nomor text,
  add column if not exists sk_tanggal date;
alter table public.pengguna drop constraint if exists pengguna_data_pejabat_check;
alter table public.pengguna add constraint pengguna_data_pejabat_check check (
  (nip is null or (nip ~ '^[0-9 ]+$' and length(replace(nip, ' ', '')) = 18))
  and (pangkat is null or length(pangkat) between 2 and 80)
  and (sk_nomor is null or length(sk_nomor) between 3 and 120)
);
comment on column public.pengguna.nip is 'NIP penanda tangan dokumen pengadaan (18 digit, boleh berspasi)';
comment on column public.pengguna.sk_nomor is 'Nomor SK penunjukan PPK (dicetak di BAP)';

alter table public.penyedia
  add column if not exists alamat   text not null default '',
  add column if not exists pimpinan text not null default '',
  add column if not exists jabatan  text not null default '',
  add column if not exists npwp     text not null default '',
  add column if not exists bank     text not null default '',
  add column if not exists rekening text not null default '';
alter table public.penyedia drop constraint if exists penyedia_data_bayar_check;
alter table public.penyedia add constraint penyedia_data_bayar_check check (
  length(alamat) <= 300 and length(pimpinan) <= 120 and length(jabatan) <= 80
  and length(npwp) <= 40 and length(bank) <= 80 and length(rekening) <= 40
);

-- ---------------------------------------------------------------------
-- 3. Paket pengadaan (satu baris = satu alur Nota Dinas s.d. BAST)
-- ---------------------------------------------------------------------
create table if not exists public.paket_pengadaan (
  id             text primary key check (id ~ '^PKT-[0-9]{4}-[0-9]{4,}$'),
  tahun          smallint not null check (tahun between 2000 and 2100),
  -- 1 Nota Dinas & HPS · 2 Surat Pesanan · 3 Nota Pembelian · 4 Kwitansi, BAP & BAST (masuk pencairan)
  tahap          smallint not null default 1 check (tahap between 1 and 4),
  pekerjaan      text not null check (length(btrim(pekerjaan)) between 3 and 300),
  unit           text not null references public.unit_kerja (kode) on update cascade,
  dana           text not null references public.sumber_dana (kode) check (dana in ('RM', 'BLU')),
  mak            text not null check (mak ~ '^[0-9]{4}\.[A-Z]{3}\.[0-9]{3}\.[0-9]{3}\.[0-9A-Z]{1,3}\.[0-9]{6}$'),
  -- [{uraian, spesifikasi[], jumlah, satuan, hargaHps, harga?, ket}]
  item           jsonb not null check (jsonb_typeof(item) = 'array' and jsonb_array_length(item) between 1 and 50),
  ppn            boolean not null default true,
  nd_nomor       text not null check (length(btrim(nd_nomor)) between 3 and 100),
  nd_tanggal     date not null,
  ppk_id         uuid not null references public.pengguna (id),
  pp_id          uuid references public.pengguna (id),
  penyedia_id    uuid references public.penyedia (id),
  sp_nomor       text check (length(btrim(sp_nomor)) between 3 and 100),
  sp_tanggal     date,
  sp_batas_hari  smallint check (sp_batas_hari between 1 and 365),
  nota_tanggal   date,
  ppn_beli       boolean,
  kw_nomor       text check (length(btrim(kw_nomor)) between 3 and 100),
  kw_tanggal     date,
  bap_nomor      text check (length(btrim(bap_nomor)) between 3 and 100),
  bap_tanggal    date,
  bap_centang    boolean not null default true,
  bast_nomor     text check (length(btrim(bast_nomor)) between 3 and 100),
  bast_tanggal   date,
  pengajuan_id   text unique references public.pengajuan (id),
  arsip          jsonb check (arsip is null or jsonb_typeof(arsip) = 'object'),
  dibuat_oleh    uuid not null references public.pengguna (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  dihapus_oleh   uuid references public.pengguna (id),
  alasan_hapus   text,
  constraint paket_tahap_lengkap check (
    (tahap < 2 or (pp_id is not null and penyedia_id is not null and sp_nomor is not null and sp_tanggal is not null and sp_batas_hari is not null))
    and (tahap < 3 or (nota_tanggal is not null and ppn_beli is not null))
    and ((tahap = 4) = (pengajuan_id is not null))
    and (tahap < 4 or (kw_nomor is not null and kw_tanggal is not null and bap_nomor is not null and bap_tanggal is not null
                       and bast_nomor is not null and bast_tanggal is not null and arsip is not null))
  ),
  constraint paket_hapus_lengkap check (deleted_at is null or (dihapus_oleh is not null and length(btrim(alasan_hapus)) >= 5))
);
comment on table public.paket_pengadaan is 'Paket pengadaan alur Kwitansi: Nota Dinas & HPS (PPK) → Surat Pesanan & Nota Pembelian (Pejabat Pengadaan) → Kwitansi, BAP & BAST (PPK).';

create index if not exists paket_tahap_idx on public.paket_pengadaan (tahap) where deleted_at is null;
create index if not exists paket_unit_idx on public.paket_pengadaan (unit);
create index if not exists paket_dana_idx on public.paket_pengadaan (dana);
create index if not exists paket_ppk_idx on public.paket_pengadaan (ppk_id);
create index if not exists paket_pp_idx on public.paket_pengadaan (pp_id);
create index if not exists paket_penyedia_idx on public.paket_pengadaan (penyedia_id);
create index if not exists paket_oleh_idx on public.paket_pengadaan (dibuat_oleh);
create index if not exists paket_dihapus_oleh_idx on public.paket_pengadaan (dihapus_oleh);

drop trigger if exists set_updated_at on public.paket_pengadaan;
create trigger set_updated_at before update on public.paket_pengadaan for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. View baca (RLS tabel dasar tetap berlaku: security_invoker)
-- ---------------------------------------------------------------------
-- Bentuk baris sama dengan tipe Paket di lib/types.ts
create or replace view public.v_paket with (security_invoker = true) as
select
  p.id, p.tahun, p.tahap, p.pekerjaan, p.unit, p.dana, p.mak, p.item, p.ppn,
  jsonb_build_object('nomor', p.nd_nomor, 'tanggal', p.nd_tanggal) as nd,
  p.ppk_id as "ppkId",
  p.pp_id as "ppId",
  p.penyedia_id as "penyediaId",
  case when p.sp_nomor is null then null
       else jsonb_build_object('nomor', p.sp_nomor, 'tanggal', p.sp_tanggal, 'batasHari', p.sp_batas_hari) end as sp,
  case when p.nota_tanggal is null then null
       else jsonb_build_object('tanggal', p.nota_tanggal, 'ppn', p.ppn_beli) end as nota,
  case when p.kw_nomor is null then null
       else jsonb_build_object('nomor', p.kw_nomor, 'tanggal', p.kw_tanggal) end as kwitansi,
  case when p.bap_nomor is null then null
       else jsonb_build_object('nomor', p.bap_nomor, 'tanggal', p.bap_tanggal, 'centang', p.bap_centang) end as bap,
  case when p.bast_nomor is null then null
       else jsonb_build_object('nomor', p.bast_nomor, 'tanggal', p.bast_tanggal) end as bast,
  p.pengajuan_id as "pengajuanId",
  p.arsip,
  p.dibuat_oleh as "dibuatOleh",
  to_char(p.created_at at time zone 'Asia/Makassar', 'YYYY-MM-DD"T"HH24:MI:SS') as "dibuatPada",
  to_char(p.updated_at at time zone 'Asia/Makassar', 'YYYY-MM-DD"T"HH24:MI:SS') as "diubahPada"
from public.paket_pengadaan p
where p.deleted_at is null;

-- Dokumen belanja kini membawa nomor paket asalnya (kolom baru di akhir view)
create or replace view public.v_pengajuan with (security_invoker = true) as
select
  k.id, k.uraian, k.no_dokumen, k.jenis_dokumen, k.penyedia_id, pv.nama as penyedia,
  k.dana, k.mak, k.akun, k.unit, k.nilai, k.tanggal, k.dibuat_oleh,
  case when k.pengesahan_nomor is not null then 'Disahkan'
       when k.pencairan_nomor is not null then 'Dicairkan'
       else 'Belum dicairkan' end as status,
  k.pencairan_nomor, rp.tanggal as pencairan_tanggal, rp.jenis as pencairan_jenis,
  k.pengesahan_nomor, rs.tanggal as pengesahan_tanggal,
  k.created_at, k.updated_at,
  (select x.id from public.paket_pengadaan x where x.pengajuan_id = k.id) as paket_id
from public.pengajuan k
join public.penyedia pv on pv.id = k.penyedia_id
left join public.rekap_pencairan rp on rp.nomor = k.pencairan_nomor
left join public.rekap_pengesahan rs on rs.nomor = k.pengesahan_nomor
where k.deleted_at is null;

-- ---------------------------------------------------------------------
-- 5. Fungsi bantu
-- ---------------------------------------------------------------------
create or replace function app.json_paket(p_id text)
returns jsonb language sql stable security definer set search_path = ''
as $$ select to_jsonb(v) from public.v_paket v where v.id = p_id $$;

-- Bentuk JSON satu belanja (sama dengan tipe Kegiatan di lib/types.ts) + nomor paket asal
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
      'nomor', rs.nomor, 'tanggal', to_char(rs.tanggal, 'YYYY-MM-DD')) end,
    'paketId', (select x.id from public.paket_pengadaan x where x.pengajuan_id = k.id)
  ))
  from public.pengajuan k
  join public.penyedia pv on pv.id = k.penyedia_id
  left join public.rekap_pencairan rp on rp.nomor = k.pencairan_nomor
  left join public.rekap_pengesahan rs on rs.nomor = k.pengesahan_nomor
  where k.id = p_id
$$;

-- Jumlah (Σ jumlah × harga satuan) untuk kolom harga 'hargaHps' atau 'harga'
create or replace function app.jumlah_item(p_item jsonb, p_kolom text)
returns bigint language sql immutable set search_path = ''
as $$
  select coalesce(sum((e->>'jumlah')::bigint * (e->>p_kolom)::bigint), 0)::bigint
  from jsonb_array_elements(p_item) e
$$;

-- Jumlah + PPN 11% (dibulatkan ke rupiah terdekat), sama dengan perhitungan di lib/pengadaan.ts
create or replace function app.total_ppn(p_jumlah bigint, p_ppn boolean)
returns bigint language sql immutable set search_path = ''
as $$ select p_jumlah + case when p_ppn then (p_jumlah * 11 + 50) / 100 else 0 end $$;

-- Rapikan & periksa daftar barang/jasa HPS
create or replace function app.rapikan_item_paket(p jsonb)
returns jsonb language plpgsql immutable set search_path = ''
as $$
declare
  v jsonb := '[]'::jsonb;
  x jsonb;
  s jsonb;
  i int := 0;
  v_uraian text;
  v_satuan text;
  v_ket text;
  v_baris text;
  v_spek jsonb;
  v_jumlah numeric;
  v_harga numeric;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'Isi minimal satu barang/jasa'; end if;
  if jsonb_array_length(p) > 50 then raise exception 'Maksimal 50 barang/jasa dalam satu paket'; end if;
  for x in select value from jsonb_array_elements(p) loop
    i := i + 1;
    if jsonb_typeof(x) <> 'object' then raise exception 'Barang/jasa ke-% tidak valid', i; end if;
    v_uraian := btrim(coalesce(x->>'uraian', ''));
    if length(v_uraian) < 2 or length(v_uraian) > 200 then raise exception 'Uraian barang/jasa ke-% wajib diisi (2–200 karakter)', i; end if;
    v_satuan := btrim(coalesce(x->>'satuan', ''));
    if length(v_satuan) < 1 or length(v_satuan) > 30 then raise exception 'Satuan barang/jasa ke-% wajib diisi (maksimal 30 karakter)', i; end if;
    v_ket := btrim(coalesce(x->>'ket', ''));
    if length(v_ket) > 100 then raise exception 'Keterangan barang/jasa ke-% maksimal 100 karakter', i; end if;
    begin
      v_jumlah := (x->>'jumlah')::numeric;
      v_harga := (x->>'hargaHps')::numeric;
    exception when others then
      raise exception 'Jumlah dan harga satuan barang/jasa ke-% harus berupa angka', i;
    end;
    if v_jumlah is null or v_jumlah < 1 or v_jumlah <> trunc(v_jumlah) or v_jumlah > 100000 then
      raise exception 'Jumlah barang/jasa ke-% harus bilangan bulat 1–100.000', i;
    end if;
    if v_harga is null or v_harga < 1 or v_harga <> trunc(v_harga) or v_harga > 10000000000 then
      raise exception 'Harga satuan HPS barang/jasa ke-% harus bilangan bulat Rp1 s.d. Rp10.000.000.000', i;
    end if;
    v_spek := '[]'::jsonb;
    if jsonb_typeof(x->'spesifikasi') = 'array' then
      for s in select value from jsonb_array_elements(x->'spesifikasi') loop
        v_baris := btrim(coalesce(s #>> '{}', ''));
        if v_baris <> '' then
          if length(v_baris) > 200 then raise exception 'Satu baris spesifikasi barang/jasa ke-% maksimal 200 karakter', i; end if;
          v_spek := v_spek || to_jsonb(v_baris);
        end if;
      end loop;
    end if;
    if jsonb_array_length(v_spek) > 20 then raise exception 'Spesifikasi barang/jasa ke-% maksimal 20 baris', i; end if;
    v := v || jsonb_build_array(jsonb_build_object(
      'uraian', v_uraian, 'spesifikasi', v_spek, 'jumlah', v_jumlah::bigint, 'satuan', v_satuan,
      'hargaHps', v_harga::bigint, 'ket', v_ket));
  end loop;
  return v;
end;
$$;

-- Ringkasan barang/jasa untuk riwayat aktivitas, mis. "2 item · HPS Rp47.917.035"
create or replace function app.ringkas_item(p_item jsonb, p_ppn boolean)
returns text language sql immutable set search_path = ''
as $$ select jsonb_array_length(p_item) || ' item · HPS ' || app.rupiah(app.total_ppn(app.jumlah_item(p_item, 'hargaHps'), p_ppn)) $$;

-- Pejabat yang boleh menjalankan tahap: pejabat paket itu sendiri, atau Administrator
create or replace function app.wajib_pejabat_paket(v_saya public.pengguna, p_pejabat uuid, p_label text, p_aksi text, p_id text)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if v_saya.peran = 'Administrator' or v_saya.id = p_pejabat then return; end if;
  raise exception 'Hanya % (% paket ini) yang dapat % %',
    coalesce((select nama from public.pengguna where id = p_pejabat), '-'), p_label, p_aksi, p_id using errcode = '42501';
end;
$$;

-- Pilih pejabat penanda tangan: peran itu sendiri → dirinya; Administrator → wajib memilih akun aktif berperan tsb.
create or replace function app.pilih_pejabat(v_saya public.pengguna, p_peran text, p_id text)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if v_saya.peran = p_peran then return v_saya.id; end if;
  begin
    v_id := nullif(btrim(coalesce(p_id, '')), '')::uuid;
  exception when others then
    v_id := null;
  end;
  if v_id is null or not exists (select 1 from public.pengguna u where u.id = v_id and u.peran = p_peran and u.aktif and u.deleted_at is null) then
    raise exception 'Pilih % penanda tangan (akun % yang aktif)', p_peran, p_peran;
  end if;
  return v_id;
end;
$$;

create or replace function app.tanggal_isian(p_teks text, p_label text)
returns date language plpgsql stable set search_path = ''
as $$
declare v date;
begin
  begin
    v := nullif(btrim(coalesce(p_teks, '')), '')::date;
  exception when others then
    raise exception '% tidak valid', p_label;
  end;
  if v is null then raise exception '% wajib diisi', p_label; end if;
  return v;
end;
$$;

create or replace function app.nomor_isian(p_teks text, p_label text)
returns text language plpgsql immutable set search_path = ''
as $$
declare v text := btrim(coalesce(p_teks, ''));
begin
  if length(v) < 3 or length(v) > 100 then raise exception '% wajib diisi (3–100 karakter)', p_label; end if;
  return v;
end;
$$;

-- Salinan data penyedia & pejabat yang dicetak (disimpan saat kwitansi terbit)
create or replace function app.arsip_paket(p public.paket_pengadaan)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'penyedia', (select jsonb_build_object('id', v.id, 'nama', v.nama, 'pimpinan', v.pimpinan, 'jabatan', v.jabatan,
                   'alamat', v.alamat, 'kota', v.kota, 'npwp', v.npwp, 'bank', v.bank, 'rekening', v.rekening)
                 from public.penyedia v where v.id = p.penyedia_id),
    'ppk', (select jsonb_strip_nulls(jsonb_build_object('id', u.id, 'nama', u.nama, 'nip', u.nip, 'pangkat', u.pangkat,
              'skNomor', u.sk_nomor, 'skTanggal', to_char(u.sk_tanggal, 'YYYY-MM-DD')))
            from public.pengguna u where u.id = p.ppk_id),
    'pp', (select jsonb_strip_nulls(jsonb_build_object('id', u.id, 'nama', u.nama, 'nip', u.nip, 'pangkat', u.pangkat))
           from public.pengguna u where u.id = p.pp_id)
  )
$$;

-- ---------------------------------------------------------------------
-- 6. RPC — Tahap 1: Nota Dinas & HPS (PPK)
--    p_id null = paket baru. p_data: {pekerjaan, unit, dana, mak, ndNomor, ndTanggal, ppn, item[], ppkId?}
-- ---------------------------------------------------------------------
create or replace function public.simpan_nota_dinas(p_id text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  p public.paket_pengadaan;
  v_pekerjaan text := btrim(coalesce(p_data->>'pekerjaan', ''));
  v_unit text := p_data->>'unit';
  v_dana text := p_data->>'dana';
  v_mak text := btrim(coalesce(p_data->>'mak', ''));
  v_nomor text;
  v_tanggal date;
  v_ppn boolean;
  v_item jsonb;
  v_ppk uuid;
  v_total bigint;
  v_tahun smallint;
  v_id text;
  v_ubah jsonb := '[]'::jsonb;
  v_akt jsonb;
begin
  v_saya := app.wajib_izin('pengadaan.ppk', 'menerbitkan nota dinas pengadaan');
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Isian nota dinas tidak valid'; end if;
  if length(v_pekerjaan) < 3 or length(v_pekerjaan) > 300 then raise exception 'Nama pekerjaan wajib diisi (3–300 karakter)'; end if;
  if not exists (select 1 from public.unit_kerja u where u.kode = v_unit and u.aktif and u.deleted_at is null) then
    raise exception 'Unit kerja tidak ditemukan atau tidak aktif';
  end if;
  if coalesce(v_dana, '') not in ('RM', 'BLU') then raise exception 'Sumber dana harus RM atau BLU'; end if;
  if v_mak !~ '^[0-9]{4}\.[A-Z]{3}\.[0-9]{3}\.[0-9]{3}\.[0-9A-Z]{1,3}\.[0-9]{6}$' then raise exception 'Format MAK tidak valid: %', v_mak; end if;
  if (v_dana = 'BLU') <> (left(right(v_mak, 6), 3) in ('525', '537')) then
    raise exception 'MAK % tidak sesuai untuk sumber dana %', v_mak, v_dana;
  end if;
  if app.sisa_mak(v_mak) is null then raise exception 'MAK % tidak ada di Kertas Kerja POK yang aktif', v_mak; end if;
  v_nomor := app.nomor_isian(p_data->>'ndNomor', 'Nomor nota dinas');
  v_tanggal := app.tanggal_isian(p_data->>'ndTanggal', 'Tanggal nota dinas');
  v_ppn := coalesce((p_data->>'ppn')::boolean, true);
  v_item := app.rapikan_item_paket(p_data->'item');
  v_total := app.total_ppn(app.jumlah_item(v_item, 'hargaHps'), v_ppn);
  if v_total > 1000000000000 then raise exception 'Total HPS terlalu besar (maksimal Rp1.000.000.000.000)'; end if;
  v_ppk := app.pilih_pejabat(v_saya, 'PPK', p_data->>'ppkId');

  -- Paket baru
  if p_id is null then
    v_tahun := extract(year from v_tanggal)::smallint;
    v_id := 'PKT-' || v_tahun || '-' || lpad(app.nomor_berikut('paket', v_tahun)::text, 4, '0');
    insert into public.paket_pengadaan (id, tahun, pekerjaan, unit, dana, mak, item, ppn, nd_nomor, nd_tanggal, ppk_id, dibuat_oleh)
    values (v_id, v_tahun, v_pekerjaan, v_unit, v_dana, v_mak, v_item, v_ppn, v_nomor, v_tanggal, v_ppk, v_saya.id);
    v_akt := app.catat(v_saya.id, 'Buat', 'Pengadaan', 'menerbitkan nota dinas & HPS', v_id, v_pekerjaan, null,
      'ND ' || v_nomor || ' · ' || app.ringkas_item(v_item, v_ppn), v_unit);
    return jsonb_build_object('berubah', 1, 'paket', app.json_paket(v_id), 'aktivitas', jsonb_build_array(v_akt));
  end if;

  -- Ubah: hanya selama Surat Pesanan belum terbit
  select * into p from public.paket_pengadaan where id = p_id and deleted_at is null for update;
  if p.id is null then raise exception 'Paket % tidak ditemukan', p_id; end if;
  if p.tahap <> 1 then
    raise exception 'Nota dinas % tidak bisa diubah karena Surat Pesanan sudah terbit. Minta Pejabat Pengadaan membatalkan Surat Pesanan lebih dulu.', p_id;
  end if;
  perform app.wajib_pejabat_paket(v_saya, p.ppk_id, 'PPK', 'mengubah nota dinas', p_id);
  if v_saya.peran <> 'Administrator' then v_ppk := p.ppk_id; end if;
  if extract(year from v_tanggal) <> p.tahun then raise exception 'Tanggal nota dinas harus pada tahun anggaran %', p.tahun; end if;

  if p.pekerjaan <> v_pekerjaan then v_ubah := v_ubah || app.ubah('Pekerjaan', p.pekerjaan, v_pekerjaan); end if;
  if p.unit <> v_unit then
    v_ubah := v_ubah || app.ubah('Unit kerja', (select nama from public.unit_kerja where kode = p.unit), (select nama from public.unit_kerja where kode = v_unit));
  end if;
  if p.dana <> v_dana then v_ubah := v_ubah || app.ubah('Sumber dana', p.dana, v_dana); end if;
  if p.mak <> v_mak then v_ubah := v_ubah || app.ubah('MAK', p.mak, v_mak); end if;
  if p.nd_nomor <> v_nomor then v_ubah := v_ubah || app.ubah('No. nota dinas', p.nd_nomor, v_nomor); end if;
  if p.nd_tanggal <> v_tanggal then v_ubah := v_ubah || app.ubah('Tanggal nota dinas', app.tgl(p.nd_tanggal), app.tgl(v_tanggal)); end if;
  if p.ppk_id <> v_ppk then
    v_ubah := v_ubah || app.ubah('PPK', (select nama from public.pengguna where id = p.ppk_id), (select nama from public.pengguna where id = v_ppk));
  end if;
  if p.ppn <> v_ppn then v_ubah := v_ubah || app.ubah('PPN 11%', case when p.ppn then 'Ya' else 'Tidak' end, case when v_ppn then 'Ya' else 'Tidak' end); end if;
  -- harga pembelian lama (dari nota yang dibatalkan) ikut terhapus bila daftar barang berubah
  if (select coalesce(jsonb_agg(e.value - 'harga' order by e.ordinality), '[]'::jsonb) from jsonb_array_elements(p.item) with ordinality e) = v_item then
    v_item := p.item;
  else
    v_ubah := v_ubah || app.ubah('Barang/jasa', app.ringkas_item(p.item, p.ppn), app.ringkas_item(v_item, v_ppn));
  end if;

  if jsonb_array_length(v_ubah) = 0 then
    return jsonb_build_object('berubah', 0, 'paket', app.json_paket(p_id), 'aktivitas', '[]'::jsonb);
  end if;
  update public.paket_pengadaan set
    pekerjaan = v_pekerjaan, unit = v_unit, dana = v_dana, mak = v_mak, nd_nomor = v_nomor, nd_tanggal = v_tanggal,
    ppk_id = v_ppk, ppn = v_ppn, item = v_item
  where id = p_id;
  v_akt := app.catat(v_saya.id, 'Ubah', 'Pengadaan', 'mengubah nota dinas & HPS', p_id, v_pekerjaan, v_ubah, null, v_unit);
  return jsonb_build_object('berubah', jsonb_array_length(v_ubah), 'paket', app.json_paket(p_id), 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- ---------------------------------------------------------------------
-- 7. RPC — Tahap 2: Surat Pesanan (Pejabat Pengadaan)
--    p_data: {spNomor, spTanggal, batasHari, ppId?, penyedia: {id?, nama, pimpinan, jabatan, alamat, kota, npwp, bank, rekening}}
--    Data penyedia ikut diperbarui di Referensi (penyedia baru langsung ditambahkan).
-- ---------------------------------------------------------------------
create or replace function public.simpan_pesanan(p_id text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  p public.paket_pengadaan;
  pv public.penyedia;
  v_baru boolean;
  v_pp uuid;
  v_nomor text;
  v_tanggal date;
  v_batas numeric;
  d jsonb := p_data->'penyedia';
  v_peny_id uuid;
  v_nama text := btrim(coalesce(d->>'nama', ''));
  v_pimpinan text := btrim(coalesce(d->>'pimpinan', ''));
  v_jabatan text := btrim(coalesce(d->>'jabatan', ''));
  v_alamat text := btrim(coalesce(d->>'alamat', ''));
  v_kota text := btrim(coalesce(d->>'kota', ''));
  v_npwp text := btrim(coalesce(d->>'npwp', ''));
  v_bank text := btrim(coalesce(d->>'bank', ''));
  v_rekening text := btrim(coalesce(d->>'rekening', ''));
  v_ubah jsonb := '[]'::jsonb;
  v_ubah_peny jsonb := '[]'::jsonb;
  v_akt jsonb := '[]'::jsonb;
begin
  v_saya := app.wajib_izin('pengadaan.pp', 'menerbitkan surat pesanan');
  select * into p from public.paket_pengadaan where id = p_id and deleted_at is null for update;
  if p.id is null then raise exception 'Paket % tidak ditemukan', p_id; end if;
  if p.tahap > 2 then
    raise exception 'Surat Pesanan % tidak bisa diubah karena Nota Pembelian sudah dicatat. Batalkan Nota Pembelian lebih dulu.', p_id;
  end if;
  v_baru := p.tahap = 1;
  if not v_baru then perform app.wajib_pejabat_paket(v_saya, p.pp_id, 'Pejabat Pengadaan', 'mengubah surat pesanan', p_id); end if;
  v_pp := app.pilih_pejabat(v_saya, 'Pejabat Pengadaan', p_data->>'ppId');

  v_nomor := app.nomor_isian(p_data->>'spNomor', 'Nomor surat pesanan');
  v_tanggal := app.tanggal_isian(p_data->>'spTanggal', 'Tanggal surat pesanan');
  if v_tanggal < p.nd_tanggal then raise exception 'Tanggal surat pesanan tidak boleh sebelum tanggal nota dinas (%)', app.tgl(p.nd_tanggal); end if;
  if extract(year from v_tanggal) <> p.tahun then raise exception 'Tanggal surat pesanan harus pada tahun anggaran %', p.tahun; end if;
  begin
    v_batas := (p_data->>'batasHari')::numeric;
  exception when others then
    v_batas := null;
  end;
  if v_batas is null or v_batas < 1 or v_batas > 365 or v_batas <> trunc(v_batas) then raise exception 'Batas waktu pelaksanaan harus 1–365 hari'; end if;

  -- Data penyedia (wajib lengkap karena dicetak di Surat Pesanan s.d. Kwitansi)
  if d is null or jsonb_typeof(d) <> 'object' then raise exception 'Pilih penyedia'; end if;
  if length(v_pimpinan) < 2 or length(v_pimpinan) > 120 then raise exception 'Nama pimpinan penyedia wajib diisi'; end if;
  if length(v_jabatan) < 2 or length(v_jabatan) > 80 then raise exception 'Jabatan pimpinan penyedia wajib diisi (mis. Direktur)'; end if;
  if length(v_alamat) < 5 or length(v_alamat) > 300 then raise exception 'Alamat penyedia wajib diisi'; end if;
  if length(v_kota) > 100 then raise exception 'Kota penyedia maksimal 100 karakter'; end if;
  if v_npwp !~ '^[0-9 .-]+$' or length(regexp_replace(v_npwp, '[^0-9]', '', 'g')) not between 15 and 16 or length(v_npwp) > 40 then
    raise exception 'NPWP penyedia harus 15 atau 16 digit (boleh memakai titik dan tanda hubung)';
  end if;
  if length(v_bank) < 2 or length(v_bank) > 80 then raise exception 'Nama bank penyedia wajib diisi'; end if;
  if v_rekening !~ '^[0-9][0-9 .-]{4,39}$' then raise exception 'Nomor rekening penyedia wajib diisi (angka, minimal 5 digit)'; end if;

  if nullif(btrim(coalesce(d->>'id', '')), '') is not null then
    begin
      v_peny_id := (d->>'id')::uuid;
    exception when others then
      raise exception 'Penyedia tidak valid';
    end;
    select * into pv from public.penyedia where id = v_peny_id and deleted_at is null for update;
    if pv.id is null then raise exception 'Penyedia tidak ditemukan'; end if;
    if not pv.aktif then raise exception 'Penyedia % tidak aktif. Aktifkan di Referensi atau pilih penyedia lain.', pv.nama; end if;
    if pv.pimpinan <> v_pimpinan then v_ubah_peny := v_ubah_peny || app.ubah('Pimpinan', nullif(pv.pimpinan, ''), v_pimpinan); end if;
    if pv.jabatan <> v_jabatan then v_ubah_peny := v_ubah_peny || app.ubah('Jabatan pimpinan', nullif(pv.jabatan, ''), v_jabatan); end if;
    if pv.alamat <> v_alamat then v_ubah_peny := v_ubah_peny || app.ubah('Alamat', nullif(pv.alamat, ''), v_alamat); end if;
    if pv.kota <> v_kota then v_ubah_peny := v_ubah_peny || app.ubah('Kota', nullif(pv.kota, ''), nullif(v_kota, '')); end if;
    if pv.npwp <> v_npwp then v_ubah_peny := v_ubah_peny || app.ubah('NPWP', nullif(pv.npwp, ''), v_npwp); end if;
    if pv.bank <> v_bank then v_ubah_peny := v_ubah_peny || app.ubah('Bank', nullif(pv.bank, ''), v_bank); end if;
    if pv.rekening <> v_rekening then v_ubah_peny := v_ubah_peny || app.ubah('No. rekening', nullif(pv.rekening, ''), v_rekening); end if;
    if jsonb_array_length(v_ubah_peny) > 0 then
      update public.penyedia set pimpinan = v_pimpinan, jabatan = v_jabatan, alamat = v_alamat, kota = v_kota,
        npwp = v_npwp, bank = v_bank, rekening = v_rekening
      where id = pv.id;
      v_akt := v_akt || app.catat(v_saya.id, 'Referensi', 'Referensi', 'mengubah penyedia', pv.id::text, pv.nama, v_ubah_peny,
                                  'Diperbarui saat surat pesanan ' || p_id);
    end if;
  else
    if length(v_nama) < 2 or length(v_nama) > 150 then raise exception 'Nama penyedia baru wajib diisi'; end if;
    if exists (select 1 from public.penyedia x where lower(x.nama) = lower(v_nama) and x.deleted_at is null) then
      raise exception 'Penyedia % sudah ada di Referensi. Pilih dari daftar penyedia.', v_nama;
    end if;
    insert into public.penyedia (nama, kota, alamat, pimpinan, jabatan, npwp, bank, rekening)
    values (v_nama, v_kota, v_alamat, v_pimpinan, v_jabatan, v_npwp, v_bank, v_rekening)
    returning * into pv;
    v_akt := v_akt || app.catat(v_saya.id, 'Referensi', 'Referensi', 'menambah penyedia', pv.id::text, pv.nama, null,
                                'Ditambahkan saat surat pesanan ' || p_id);
  end if;

  if v_baru then
    update public.paket_pengadaan set tahap = 2, pp_id = v_pp, penyedia_id = pv.id, sp_nomor = v_nomor, sp_tanggal = v_tanggal,
      sp_batas_hari = v_batas::smallint
    where id = p_id;
    v_akt := v_akt || app.catat(v_saya.id, 'Status', 'Pengadaan', 'menerbitkan surat pesanan', p_id, p.pekerjaan, null,
      'SP ' || v_nomor || ' · ' || pv.nama || ' · paling lambat ' || v_batas || ' hari', p.unit);
    return jsonb_build_object('berubah', 1, 'paket', app.json_paket(p_id), 'aktivitas', v_akt, 'penyedia', true);
  end if;

  if p.pp_id <> v_pp then
    v_ubah := v_ubah || app.ubah('Pejabat Pengadaan', (select nama from public.pengguna where id = p.pp_id), (select nama from public.pengguna where id = v_pp));
  end if;
  if p.penyedia_id <> pv.id then
    v_ubah := v_ubah || app.ubah('Penyedia', (select nama from public.penyedia where id = p.penyedia_id), pv.nama);
  end if;
  if p.sp_nomor <> v_nomor then v_ubah := v_ubah || app.ubah('No. surat pesanan', p.sp_nomor, v_nomor); end if;
  if p.sp_tanggal <> v_tanggal then v_ubah := v_ubah || app.ubah('Tanggal surat pesanan', app.tgl(p.sp_tanggal), app.tgl(v_tanggal)); end if;
  if p.sp_batas_hari <> v_batas then v_ubah := v_ubah || app.ubah('Batas waktu', p.sp_batas_hari || ' hari', v_batas || ' hari'); end if;
  if jsonb_array_length(v_ubah) > 0 then
    update public.paket_pengadaan set pp_id = v_pp, penyedia_id = pv.id, sp_nomor = v_nomor, sp_tanggal = v_tanggal, sp_batas_hari = v_batas::smallint
    where id = p_id;
    v_akt := v_akt || app.catat(v_saya.id, 'Ubah', 'Pengadaan', 'mengubah surat pesanan', p_id, p.pekerjaan, v_ubah, null, p.unit);
  end if;
  return jsonb_build_object('berubah', jsonb_array_length(v_ubah) + jsonb_array_length(v_ubah_peny), 'paket', app.json_paket(p_id),
                            'aktivitas', v_akt, 'penyedia', jsonb_array_length(v_ubah_peny) > 0);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. RPC — Tahap 3: Nota / Bukti Pembelian (Pejabat Pengadaan)
--    p_data: {notaTanggal, ppn, harga: [harga satuan per barang, urut sesuai HPS]}
-- ---------------------------------------------------------------------
create or replace function public.simpan_pembelian(p_id text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  p public.paket_pengadaan;
  v_baru boolean;
  v_tanggal date;
  v_ppn boolean;
  v_harga jsonb := p_data->'harga';
  v_item jsonb := '[]'::jsonb;
  x jsonb;
  i int := 0;
  v_h numeric;
  v_total bigint;
  v_total_lama bigint;
  v_hps bigint;
  v_ubah jsonb := '[]'::jsonb;
  v_akt jsonb;
begin
  v_saya := app.wajib_izin('pengadaan.pp', 'mencatat nota pembelian');
  select * into p from public.paket_pengadaan where id = p_id and deleted_at is null for update;
  if p.id is null then raise exception 'Paket % tidak ditemukan', p_id; end if;
  if p.tahap = 1 then raise exception 'Terbitkan Surat Pesanan % lebih dulu sebelum mencatat nota pembelian', p_id; end if;
  if p.tahap = 4 then
    raise exception 'Nota pembelian % tidak bisa diubah karena Kwitansi sudah terbit. Minta PPK membatalkan Kwitansi lebih dulu.', p_id;
  end if;
  v_baru := p.tahap = 2;
  perform app.wajib_pejabat_paket(v_saya, p.pp_id, 'Pejabat Pengadaan', case when v_baru then 'mencatat nota pembelian' else 'mengubah nota pembelian' end, p_id);
  v_tanggal := app.tanggal_isian(p_data->>'notaTanggal', 'Tanggal nota pembelian');
  if v_tanggal < p.sp_tanggal then raise exception 'Tanggal nota pembelian tidak boleh sebelum tanggal surat pesanan (%)', app.tgl(p.sp_tanggal); end if;
  if extract(year from v_tanggal) <> p.tahun then raise exception 'Tanggal nota pembelian harus pada tahun anggaran %', p.tahun; end if;
  v_ppn := coalesce((p_data->>'ppn')::boolean, p.ppn);
  if v_harga is null or jsonb_typeof(v_harga) <> 'array' or jsonb_array_length(v_harga) <> jsonb_array_length(p.item) then
    raise exception 'Isi harga satuan untuk setiap barang/jasa';
  end if;
  for x in select value from jsonb_array_elements(p.item) loop
    begin
      v_h := (v_harga->>i)::numeric;
    exception when others then
      v_h := null;
    end;
    i := i + 1;
    if v_h is null or v_h < 1 or v_h <> trunc(v_h) or v_h > 10000000000 then
      raise exception 'Harga satuan pembelian barang/jasa ke-% harus bilangan bulat lebih dari 0', i;
    end if;
    v_item := v_item || jsonb_build_array(x || jsonb_build_object('harga', v_h::bigint));
  end loop;
  v_total := app.total_ppn(app.jumlah_item(v_item, 'harga'), v_ppn);
  v_hps := app.total_ppn(app.jumlah_item(p.item, 'hargaHps'), p.ppn);
  if v_total > v_hps then
    raise exception 'Total pembelian % melebihi HPS %', app.rupiah(v_total), app.rupiah(v_hps);
  end if;

  if v_baru then
    update public.paket_pengadaan set tahap = 3, nota_tanggal = v_tanggal, ppn_beli = v_ppn, item = v_item where id = p_id;
    v_akt := app.catat(v_saya.id, 'Status', 'Pengadaan', 'mencatat nota pembelian', p_id, p.pekerjaan, null,
      'Nota ' || app.tgl(v_tanggal) || ' · ' || app.rupiah(v_total) || case when v_ppn then ' (termasuk PPN 11%)' else '' end, p.unit);
    return jsonb_build_object('berubah', 1, 'paket', app.json_paket(p_id), 'aktivitas', jsonb_build_array(v_akt));
  end if;

  v_total_lama := app.total_ppn(app.jumlah_item(p.item, 'harga'), p.ppn_beli);
  if p.nota_tanggal <> v_tanggal then v_ubah := v_ubah || app.ubah('Tanggal nota', app.tgl(p.nota_tanggal), app.tgl(v_tanggal)); end if;
  if p.ppn_beli <> v_ppn then v_ubah := v_ubah || app.ubah('PPN 11%', case when p.ppn_beli then 'Ya' else 'Tidak' end, case when v_ppn then 'Ya' else 'Tidak' end); end if;
  if p.item <> v_item then v_ubah := v_ubah || app.ubah('Total pembelian', app.rupiah(v_total_lama), app.rupiah(v_total)); end if;
  if jsonb_array_length(v_ubah) = 0 then
    return jsonb_build_object('berubah', 0, 'paket', app.json_paket(p_id), 'aktivitas', '[]'::jsonb);
  end if;
  update public.paket_pengadaan set nota_tanggal = v_tanggal, ppn_beli = v_ppn, item = v_item where id = p_id;
  v_akt := app.catat(v_saya.id, 'Ubah', 'Pengadaan', 'mengubah nota pembelian', p_id, p.pekerjaan, v_ubah, null, p.unit);
  return jsonb_build_object('berubah', jsonb_array_length(v_ubah), 'paket', app.json_paket(p_id), 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- ---------------------------------------------------------------------
-- 9. RPC — Tahap 4: Kwitansi, BAP & BAST (PPK) → dokumen belanja Kwitansi di Daftar Pencairan
--    p_data: {kwNomor, kwTanggal, bapNomor, bapTanggal, bastNomor, bastTanggal, centang}
-- ---------------------------------------------------------------------
create or replace function public.simpan_kwitansi(p_id text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  p public.paket_pengadaan;
  pv public.penyedia;
  k public.pengajuan;
  v_baru boolean;
  v_kw_nomor text;
  v_kw_tanggal date;
  v_bap_nomor text;
  v_bap_tanggal date;
  v_bast_nomor text;
  v_bast_tanggal date;
  v_centang boolean;
  v_total bigint;
  v_arsip jsonb;
  v_data jsonb;
  v_tahun smallint := app.tahun_ini();
  v_blj text;
  v_ubah jsonb := '[]'::jsonb;
  v_ubah_blj jsonb := '[]'::jsonb;
  v_akt jsonb := '[]'::jsonb;
begin
  v_saya := app.wajib_izin('pengadaan.ppk', 'menerbitkan kwitansi');
  select * into p from public.paket_pengadaan where id = p_id and deleted_at is null for update;
  if p.id is null then raise exception 'Paket % tidak ditemukan', p_id; end if;
  if p.tahap < 3 then raise exception 'Kwitansi % baru bisa diterbitkan setelah Pejabat Pengadaan mencatat nota pembelian', p_id; end if;
  v_baru := p.tahap = 3;
  perform app.wajib_pejabat_paket(v_saya, p.ppk_id, 'PPK', case when v_baru then 'menerbitkan kwitansi' else 'mengubah kwitansi' end, p_id);
  if not v_baru then
    select * into k from public.pengajuan where id = p.pengajuan_id for update;
    if k.pencairan_nomor is not null then
      raise exception 'Kwitansi % sudah dicairkan pada % sehingga tidak bisa diubah', p_id, k.pencairan_nomor;
    end if;
  end if;

  v_kw_nomor := app.nomor_isian(p_data->>'kwNomor', 'Nomor kwitansi');
  v_kw_tanggal := app.tanggal_isian(p_data->>'kwTanggal', 'Tanggal kwitansi');
  v_bap_nomor := app.nomor_isian(p_data->>'bapNomor', 'Nomor BAP');
  v_bap_tanggal := app.tanggal_isian(p_data->>'bapTanggal', 'Tanggal BAP');
  v_bast_nomor := app.nomor_isian(p_data->>'bastNomor', 'Nomor BAST');
  v_bast_tanggal := app.tanggal_isian(p_data->>'bastTanggal', 'Tanggal BAST');
  v_centang := coalesce((p_data->>'centang')::boolean, true);
  if v_kw_tanggal < p.nota_tanggal or v_bap_tanggal < p.nota_tanggal or v_bast_tanggal < p.nota_tanggal then
    raise exception 'Tanggal kwitansi, BAP, dan BAST tidak boleh sebelum tanggal nota pembelian (%)', app.tgl(p.nota_tanggal);
  end if;
  if extract(year from v_kw_tanggal) <> p.tahun or extract(year from v_bap_tanggal) <> p.tahun or extract(year from v_bast_tanggal) <> p.tahun then
    raise exception 'Tanggal kwitansi, BAP, dan BAST harus pada tahun anggaran %', p.tahun;
  end if;
  select * into pv from public.penyedia where id = p.penyedia_id;
  if not pv.aktif or pv.deleted_at is not null then raise exception 'Penyedia % tidak aktif. Aktifkan kembali di Referensi.', pv.nama; end if;
  if pv.pimpinan = '' or pv.alamat = '' or pv.npwp = '' or pv.bank = '' or pv.rekening = '' then
    raise exception 'Data penyedia % belum lengkap (pimpinan, alamat, NPWP, bank, rekening). Minta Pejabat Pengadaan melengkapinya di Surat Pesanan.', pv.nama;
  end if;
  v_total := app.total_ppn(app.jumlah_item(p.item, 'harga'), p.ppn_beli);
  v_arsip := app.arsip_paket(p);

  if v_baru then
    -- dokumen belanja jenis Kwitansi → langsung masuk Daftar Pencairan
    v_data := jsonb_build_object('uraian', p.pekerjaan, 'jenisDokumen', 'Kwitansi', 'noDokumen', v_kw_nomor,
      'penyediaId', p.penyedia_id, 'unit', p.unit, 'dana', p.dana, 'mak', p.mak, 'nilai', v_total, 'tanggal', v_kw_tanggal);
    perform app.periksa_isi_pengajuan(v_data, v_saya);
    v_blj := 'BLJ-' || v_tahun || '-' || lpad(app.nomor_berikut('pengajuan', v_tahun)::text, 4, '0');
    insert into public.pengajuan (id, uraian, jenis_dokumen, no_dokumen, penyedia_id, unit, dana, mak, nilai, tanggal, dibuat_oleh)
    values (v_blj, p.pekerjaan, 'Kwitansi', v_kw_nomor, p.penyedia_id, p.unit, p.dana, p.mak, v_total, v_kw_tanggal, v_saya.id);
    update public.paket_pengadaan set tahap = 4, kw_nomor = v_kw_nomor, kw_tanggal = v_kw_tanggal, bap_nomor = v_bap_nomor,
      bap_tanggal = v_bap_tanggal, bast_nomor = v_bast_nomor, bast_tanggal = v_bast_tanggal, bap_centang = v_centang,
      pengajuan_id = v_blj, arsip = v_arsip
    where id = p_id;
    v_akt := v_akt || app.catat(v_saya.id, 'Status', 'Pengadaan', 'menerbitkan kwitansi, BAP & BAST', p_id, p.pekerjaan, null,
      'Kwitansi ' || v_kw_nomor || ' · ' || app.rupiah(v_total) || ' · masuk Daftar Pencairan sebagai ' || v_blj, p.unit);
    v_akt := v_akt || app.catat(v_saya.id, 'Buat', 'Belanja', 'mencatat dokumen belanja dari paket ' || p_id, v_blj, p.pekerjaan, null,
      'Kwitansi · ' || app.rupiah(v_total) || ' · MAK ' || p.mak, p.unit);
    return jsonb_build_object('berubah', 1, 'paket', app.json_paket(p_id), 'pengajuan', app.json_pengajuan(v_blj), 'aktivitas', v_akt);
  end if;

  if p.kw_nomor <> v_kw_nomor then v_ubah := v_ubah || app.ubah('No. kwitansi', p.kw_nomor, v_kw_nomor); end if;
  if p.kw_tanggal <> v_kw_tanggal then v_ubah := v_ubah || app.ubah('Tanggal kwitansi', app.tgl(p.kw_tanggal), app.tgl(v_kw_tanggal)); end if;
  if p.bap_nomor <> v_bap_nomor then v_ubah := v_ubah || app.ubah('No. BAP', p.bap_nomor, v_bap_nomor); end if;
  if p.bap_tanggal <> v_bap_tanggal then v_ubah := v_ubah || app.ubah('Tanggal BAP', app.tgl(p.bap_tanggal), app.tgl(v_bap_tanggal)); end if;
  if p.bast_nomor <> v_bast_nomor then v_ubah := v_ubah || app.ubah('No. BAST', p.bast_nomor, v_bast_nomor); end if;
  if p.bast_tanggal <> v_bast_tanggal then v_ubah := v_ubah || app.ubah('Tanggal BAST', app.tgl(p.bast_tanggal), app.tgl(v_bast_tanggal)); end if;
  if p.bap_centang <> v_centang then
    v_ubah := v_ubah || app.ubah('Tanda √ lampiran BAP', case when p.bap_centang then 'Ya' else 'Tidak' end, case when v_centang then 'Ya' else 'Tidak' end);
  end if;
  if p.arsip is distinct from v_arsip then v_ubah := v_ubah || app.ubah('Data penyedia & pejabat', 'versi sebelumnya', 'diperbarui'); end if;
  if jsonb_array_length(v_ubah) = 0 then
    return jsonb_build_object('berubah', 0, 'paket', app.json_paket(p_id), 'aktivitas', '[]'::jsonb);
  end if;
  update public.paket_pengadaan set kw_nomor = v_kw_nomor, kw_tanggal = v_kw_tanggal, bap_nomor = v_bap_nomor, bap_tanggal = v_bap_tanggal,
    bast_nomor = v_bast_nomor, bast_tanggal = v_bast_tanggal, bap_centang = v_centang, arsip = v_arsip
  where id = p_id;
  v_akt := v_akt || app.catat(v_saya.id, 'Ubah', 'Pengadaan', 'mengubah kwitansi, BAP & BAST', p_id, p.pekerjaan, v_ubah, null, p.unit);
  -- dokumen belanja mengikuti nomor & tanggal kwitansi
  if k.no_dokumen <> v_kw_nomor then v_ubah_blj := v_ubah_blj || app.ubah('No. dokumen', k.no_dokumen, v_kw_nomor); end if;
  if k.tanggal <> v_kw_tanggal then v_ubah_blj := v_ubah_blj || app.ubah('Tanggal dokumen', app.tgl(k.tanggal), app.tgl(v_kw_tanggal)); end if;
  if jsonb_array_length(v_ubah_blj) > 0 then
    update public.pengajuan set no_dokumen = v_kw_nomor, tanggal = v_kw_tanggal where id = k.id;
    v_akt := v_akt || app.catat(v_saya.id, 'Ubah', 'Belanja', 'mengubah dokumen belanja dari paket ' || p_id, k.id, k.uraian, v_ubah_blj, null, k.unit);
  end if;
  return jsonb_build_object('berubah', jsonb_array_length(v_ubah), 'paket', app.json_paket(p_id), 'pengajuan', app.json_pengajuan(k.id), 'aktivitas', v_akt);
end;
$$;

-- ---------------------------------------------------------------------
-- 10. RPC — Batalkan tahap terakhir (isian tetap tersimpan untuk diperbaiki) & hapus paket
-- ---------------------------------------------------------------------
create or replace function public.batal_tahap_paket(p_id text, p_alasan text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  p public.paket_pengadaan;
  k public.pengajuan;
  v_akt jsonb := '[]'::jsonb;
  v_alasan text := btrim(coalesce(p_alasan, ''));
begin
  v_saya := app.wajib_profil();
  if length(v_alasan) < 5 then raise exception 'Tuliskan alasan pembatalan (minimal 5 karakter)'; end if;
  if length(v_alasan) > 500 then raise exception 'Alasan pembatalan maksimal 500 karakter'; end if;
  select * into p from public.paket_pengadaan where id = p_id and deleted_at is null for update;
  if p.id is null then raise exception 'Paket % tidak ditemukan', p_id; end if;

  if p.tahap = 1 then
    raise exception 'Paket % masih di tahap Nota Dinas. Hapus paket bila nota dinas tidak jadi dipakai.', p_id;
  elsif p.tahap in (2, 3) then
    perform app.wajib_izin('pengadaan.pp', 'membatalkan tahap pengadaan');
    perform app.wajib_pejabat_paket(v_saya, p.pp_id, 'Pejabat Pengadaan', 'membatalkan', p_id);
    update public.paket_pengadaan set tahap = p.tahap - 1 where id = p_id;
    v_akt := v_akt || app.catat(v_saya.id, 'Status', 'Pengadaan',
      case when p.tahap = 2 then 'membatalkan surat pesanan' else 'membatalkan nota pembelian' end,
      p_id, p.pekerjaan, null, v_alasan, p.unit);
    return jsonb_build_object('paket', app.json_paket(p_id), 'aktivitas', v_akt);
  end if;

  -- tahap 4: kwitansi dibatalkan → dokumen belanja dihapus dari Daftar Pencairan
  perform app.wajib_izin('pengadaan.ppk', 'membatalkan kwitansi');
  perform app.wajib_pejabat_paket(v_saya, p.ppk_id, 'PPK', 'membatalkan kwitansi', p_id);
  select * into k from public.pengajuan where id = p.pengajuan_id for update;
  if k.pencairan_nomor is not null then
    raise exception 'Kwitansi % sudah dicairkan pada % sehingga tidak bisa dibatalkan', p_id, k.pencairan_nomor;
  end if;
  update public.paket_pengadaan set tahap = 3, pengajuan_id = null, arsip = null where id = p_id;
  update public.pengajuan set deleted_at = now(), dihapus_oleh = v_saya.id,
    alasan_hapus = left('Kwitansi paket ' || p_id || ' dibatalkan: ' || v_alasan, 1000)
  where id = k.id;
  v_akt := v_akt || app.catat(v_saya.id, 'Status', 'Pengadaan', 'membatalkan kwitansi, BAP & BAST', p_id, p.pekerjaan, null,
    v_alasan || ' · ' || k.id || ' dikeluarkan dari Daftar Pencairan', p.unit);
  v_akt := v_akt || app.catat(v_saya.id, 'Hapus', 'Belanja', 'menghapus dokumen belanja (kwitansi paket ' || p_id || ' dibatalkan)', k.id, k.uraian,
    jsonb_build_array(
      app.ubah('No. dokumen', k.jenis_dokumen || ' ' || k.no_dokumen, 'dihapus'),
      app.ubah('Penyedia', (select nama from public.penyedia where id = k.penyedia_id), 'dihapus'),
      app.ubah('MAK', k.mak, 'dihapus'),
      app.ubah('Nilai', app.rupiah(k.nilai), 'dihapus')),
    v_alasan, k.unit);
  return jsonb_build_object('paket', app.json_paket(p_id), 'pengajuanDihapus', k.id, 'aktivitas', v_akt);
end;
$$;

create or replace function public.hapus_paket(p_id text, p_alasan text)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  p public.paket_pengadaan;
  v_alasan text := btrim(coalesce(p_alasan, ''));
  v_akt jsonb;
begin
  v_saya := app.wajib_izin('pengadaan.ppk', 'menghapus paket pengadaan');
  if length(v_alasan) < 5 then raise exception 'Tuliskan alasan penghapusan (minimal 5 karakter)'; end if;
  if length(v_alasan) > 500 then raise exception 'Alasan penghapusan maksimal 500 karakter'; end if;
  select * into p from public.paket_pengadaan where id = p_id and deleted_at is null for update;
  if p.id is null then raise exception 'Paket % tidak ditemukan', p_id; end if;
  if p.tahap <> 1 then
    raise exception 'Paket % tidak bisa dihapus karena Surat Pesanan sudah terbit. Minta Pejabat Pengadaan membatalkan Surat Pesanan lebih dulu.', p_id;
  end if;
  perform app.wajib_pejabat_paket(v_saya, p.ppk_id, 'PPK', 'menghapus paket', p_id);
  update public.paket_pengadaan set deleted_at = now(), dihapus_oleh = v_saya.id, alasan_hapus = v_alasan where id = p_id;
  v_akt := app.catat(v_saya.id, 'Hapus', 'Pengadaan', 'menghapus paket pengadaan', p_id, p.pekerjaan,
    jsonb_build_array(
      app.ubah('No. nota dinas', p.nd_nomor, 'dihapus'),
      app.ubah('MAK', p.mak, 'dihapus'),
      app.ubah('Barang/jasa', app.ringkas_item(p.item, p.ppn), 'dihapus')),
    v_alasan, p.unit);
  return jsonb_build_object('aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- ---------------------------------------------------------------------
-- 11. RPC — Data penanda tangan (NIP, pangkat, SK) oleh Administrator atau pemilik akun
--     p_data: {nip, pangkat, skNomor, skTanggal}; isian kosong = dihapus
-- ---------------------------------------------------------------------
create or replace function public.simpan_data_pejabat(p_id uuid, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  l public.pengguna;
  v public.pengguna;
  v_nip text := nullif(btrim(regexp_replace(coalesce(p_data->>'nip', ''), '\s+', ' ', 'g')), '');
  v_pangkat text := nullif(btrim(coalesce(p_data->>'pangkat', '')), '');
  v_sk text := nullif(btrim(coalesce(p_data->>'skNomor', '')), '');
  v_sk_tgl date;
  v_ubah jsonb := '[]'::jsonb;
  v_akt jsonb;
begin
  v_saya := app.wajib_profil();
  if p_id is distinct from v_saya.id and not exists (select 1 from public.izin_peran i where i.peran = v_saya.peran and i.izin = 'pengguna.kelola') then
    raise exception 'Anda hanya dapat mengubah data penanda tangan akun sendiri' using errcode = '42501';
  end if;
  select * into l from public.pengguna where id = p_id and deleted_at is null for update;
  if l.id is null then raise exception 'Pengguna tidak ditemukan'; end if;
  if v_nip is not null and (v_nip !~ '^[0-9 ]+$' or length(replace(v_nip, ' ', '')) <> 18) then
    raise exception 'NIP harus 18 digit angka (boleh berspasi)';
  end if;
  if v_pangkat is not null and length(v_pangkat) > 80 then raise exception 'Pangkat/golongan maksimal 80 karakter'; end if;
  if v_sk is not null and (length(v_sk) < 3 or length(v_sk) > 120) then raise exception 'Nomor SK 3–120 karakter'; end if;
  begin
    v_sk_tgl := nullif(btrim(coalesce(p_data->>'skTanggal', '')), '')::date;
  exception when others then
    raise exception 'Tanggal SK tidak valid';
  end;
  if l.nip is distinct from v_nip then v_ubah := v_ubah || app.ubah('NIP', l.nip, v_nip); end if;
  if l.pangkat is distinct from v_pangkat then v_ubah := v_ubah || app.ubah('Pangkat/golongan', l.pangkat, v_pangkat); end if;
  if l.sk_nomor is distinct from v_sk then v_ubah := v_ubah || app.ubah('No. SK penunjukan', l.sk_nomor, v_sk); end if;
  if l.sk_tanggal is distinct from v_sk_tgl then v_ubah := v_ubah || app.ubah('Tanggal SK', app.tgl(l.sk_tanggal), app.tgl(v_sk_tgl)); end if;
  if jsonb_array_length(v_ubah) = 0 then
    return jsonb_build_object('berubah', 0, 'pengguna', to_jsonb(l), 'aktivitas', '[]'::jsonb);
  end if;
  update public.pengguna set nip = v_nip, pangkat = v_pangkat, sk_nomor = v_sk, sk_tanggal = v_sk_tgl where id = p_id returning * into v;
  v_akt := app.catat(v_saya.id, 'Pengguna', 'Pengguna', 'mengubah data penanda tangan', v.id::text, v.nama, v_ubah);
  return jsonb_build_object('berubah', jsonb_array_length(v_ubah), 'pengguna', to_jsonb(v), 'aktivitas', jsonb_build_array(v_akt));
end;
$$;

-- ---------------------------------------------------------------------
-- 12. Penyesuaian fungsi lama
-- ---------------------------------------------------------------------
-- Aktivitas dari browser: cetak lembar belanja (perbaikan) & cetak dokumen pengadaan, masuk/keluar
create or replace function public.catat_aktivitas(
  p_jenis text, p_aksi text, p_objek_id text default null, p_objek_label text default null, p_catatan text default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_saya public.pengguna;
  v_unit text;
  v_label text;
begin
  v_saya := app.wajib_profil();
  if p_jenis = 'Cetak' then
    if p_aksi in ('mencetak lembar belanja', 'mencetak lembar pengajuan') then
      select unit, uraian into v_unit, v_label from public.pengajuan where id = p_objek_id and deleted_at is null;
      if v_unit is null then raise exception 'Dokumen belanja % tidak ditemukan', p_objek_id; end if;
      return app.catat(v_saya.id, 'Cetak', 'Belanja', 'mencetak lembar belanja', p_objek_id, v_label, null, null, v_unit);
    elsif p_aksi = 'mencetak dokumen pengadaan' then
      select unit, pekerjaan into v_unit, v_label from public.paket_pengadaan where id = p_objek_id and deleted_at is null;
      if v_unit is null then raise exception 'Paket % tidak ditemukan', p_objek_id; end if;
      return app.catat(v_saya.id, 'Cetak', 'Pengadaan', p_aksi, p_objek_id, v_label, null, left(p_catatan, 500), v_unit);
    end if;
    raise exception 'Aksi cetak tidak dikenal';
  elsif p_jenis = 'Sesi' then
    if p_aksi not in ('masuk ke aplikasi', 'keluar dari aplikasi') then raise exception 'Aksi sesi tidak dikenal'; end if;
    return app.catat(v_saya.id, 'Sesi', 'Sistem', p_aksi, null, null, null,
                     case when p_aksi = 'masuk ke aplikasi' then 'Peran ' || v_saya.peran end, null);
  end if;
  raise exception 'Jenis aktivitas % hanya dicatat oleh sistem', p_jenis using errcode = '42501';
end;
$$;

-- Dokumen belanja hasil paket pengadaan hanya diubah/dibatalkan lewat modul Pengadaan
create or replace function app.wajib_pemilik(p_id text, v_saya public.pengguna, p_aksi text)
returns public.pengajuan language plpgsql volatile security definer set search_path = ''
as $$
declare
  k public.pengajuan;
  v_paket text;
begin
  select * into k from public.pengajuan where id = p_id and deleted_at is null for update;
  if k.id is null then raise exception 'Dokumen belanja % tidak ditemukan', p_id; end if;
  select x.id into v_paket from public.paket_pengadaan x where x.pengajuan_id = p_id;
  if v_paket is not null then
    raise exception '% terbit dari paket pengadaan %; ubah atau batalkan kwitansinya lewat modul Pengadaan', p_id, v_paket;
  end if;
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

-- Referensi: penyedia kini menyimpan data pembayaran (pimpinan, alamat, NPWP, bank, rekening)
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
  -- isian penyedia
  v_bidang text := btrim(coalesce(p_data->>'bidang', ''));
  v_kota text := btrim(coalesce(p_data->>'kota', ''));
  v_alamat text := btrim(coalesce(p_data->>'alamat', ''));
  v_pimpinan text := btrim(coalesce(p_data->>'pimpinan', ''));
  v_jabatan text := btrim(coalesce(p_data->>'jabatan', ''));
  v_npwp text := btrim(coalesce(p_data->>'npwp', ''));
  v_bank text := btrim(coalesce(p_data->>'bank', ''));
  v_rekening text := btrim(coalesce(p_data->>'rekening', ''));
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
        insert into public.penyedia (nama, bidang, kota, alamat, pimpinan, jabatan, npwp, bank, rekening)
        values (btrim(p_data->>'nama'), v_bidang, v_kota, v_alamat, v_pimpinan, v_jabatan, v_npwp, v_bank, v_rekening)
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
        if pv.bidang <> v_bidang then v_ubah := v_ubah || app.ubah('Bidang', nullif(pv.bidang, ''), nullif(v_bidang, '')); end if;
        if pv.kota <> v_kota then v_ubah := v_ubah || app.ubah('Kota', nullif(pv.kota, ''), nullif(v_kota, '')); end if;
        if pv.alamat <> v_alamat then v_ubah := v_ubah || app.ubah('Alamat', nullif(pv.alamat, ''), nullif(v_alamat, '')); end if;
        if pv.pimpinan <> v_pimpinan then v_ubah := v_ubah || app.ubah('Pimpinan', nullif(pv.pimpinan, ''), nullif(v_pimpinan, '')); end if;
        if pv.jabatan <> v_jabatan then v_ubah := v_ubah || app.ubah('Jabatan pimpinan', nullif(pv.jabatan, ''), nullif(v_jabatan, '')); end if;
        if pv.npwp <> v_npwp then v_ubah := v_ubah || app.ubah('NPWP', nullif(pv.npwp, ''), nullif(v_npwp, '')); end if;
        if pv.bank <> v_bank then v_ubah := v_ubah || app.ubah('Bank', nullif(pv.bank, ''), nullif(v_bank, '')); end if;
        if pv.rekening <> v_rekening then v_ubah := v_ubah || app.ubah('No. rekening', nullif(pv.rekening, ''), nullif(v_rekening, '')); end if;
        if pv.aktif <> coalesce((p_data->>'aktif')::boolean, pv.aktif) then
          v_ubah := v_ubah || app.ubah('Status', case when pv.aktif then 'Aktif' else 'Tidak aktif' end, case when (p_data->>'aktif')::boolean then 'Aktif' else 'Tidak aktif' end);
        end if;
        update public.penyedia set nama = btrim(p_data->>'nama'), bidang = v_bidang, kota = v_kota, alamat = v_alamat, pimpinan = v_pimpinan,
          jabatan = v_jabatan, npwp = v_npwp, bank = v_bank, rekening = v_rekening, aktif = coalesce((p_data->>'aktif')::boolean, aktif)
        where id = pv.id;
        v_obj_id := pv.id::text; v_obj_label := btrim(p_data->>'nama');
    end case;
    if jsonb_array_length(v_ubah) = 0 then return jsonb_build_object('berubah', 0, 'aktivitas', '[]'::jsonb); end if;
    v_akt := app.catat(v_saya.id, 'Referensi', 'Referensi', 'mengubah ' || v_label, v_obj_id, v_obj_label, v_ubah);
  end if;
  return jsonb_build_object('berubah', greatest(jsonb_array_length(v_ubah), 1), 'aktivitas', jsonb_build_array(v_akt));
exception
  when unique_violation then raise exception 'Kode atau nama % sudah ada', v_label;
  when check_violation then raise exception 'Isian % tidak valid (periksa format kode, panjang isian, atau warna #RRGGBB)', v_label;
end;
$$;

-- ---------------------------------------------------------------------
-- 13. RLS
-- ---------------------------------------------------------------------
alter table public.paket_pengadaan enable row level security;
drop policy if exists "pengguna aktif membaca paket" on public.paket_pengadaan;
create policy "pengguna aktif membaca paket" on public.paket_pengadaan for select to authenticated
  using ((select app.aktif_saya()) and deleted_at is null);

-- Tanpa izin "aktivitas.semua": aktivitas sendiri + aktivitas dokumen belanja & pengadaan
drop policy if exists "membaca aktivitas" on public.aktivitas;
create policy "membaca aktivitas" on public.aktivitas for select to authenticated
  using (
    (select app.aktif_saya())
    and (
      (select app.punya_izin('aktivitas.semua'))
      or oleh = (select app.id_saya())
      or (modul in ('Belanja', 'Pengadaan', 'Pencairan', 'Pengesahan') and (select app.punya_izin('belanja.lihatSemua')))
      or (unit is not null and unit = (select app.unit_saya()))
    )
  );

-- ---------------------------------------------------------------------
-- 14. Hak akses (GRANT)
-- ---------------------------------------------------------------------
revoke all on public.paket_pengadaan, public.v_paket from anon, authenticated;
grant select on public.paket_pengadaan, public.v_paket to authenticated;
grant all on public.paket_pengadaan, public.v_paket to service_role;

revoke execute on function
  public.simpan_nota_dinas(text, jsonb), public.simpan_pesanan(text, jsonb), public.simpan_pembelian(text, jsonb),
  public.simpan_kwitansi(text, jsonb), public.batal_tahap_paket(text, text), public.hapus_paket(text, text),
  public.simpan_data_pejabat(uuid, jsonb)
from public, anon;
grant execute on function
  public.simpan_nota_dinas(text, jsonb), public.simpan_pesanan(text, jsonb), public.simpan_pembelian(text, jsonb),
  public.simpan_kwitansi(text, jsonb), public.batal_tahap_paket(text, text), public.hapus_paket(text, text),
  public.simpan_data_pejabat(uuid, jsonb)
to authenticated, service_role;

revoke execute on function
  app.json_paket(text), app.jumlah_item(jsonb, text), app.total_ppn(bigint, boolean), app.rapikan_item_paket(jsonb),
  app.ringkas_item(jsonb, boolean), app.wajib_pejabat_paket(public.pengguna, uuid, text, text, text),
  app.pilih_pejabat(public.pengguna, text, text), app.tanggal_isian(text, text), app.nomor_isian(text, text),
  app.arsip_paket(public.paket_pengadaan)
from public, anon, authenticated;
grant execute on function
  app.json_paket(text), app.jumlah_item(jsonb, text), app.total_ppn(bigint, boolean), app.rapikan_item_paket(jsonb),
  app.ringkas_item(jsonb, boolean), app.wajib_pejabat_paket(public.pengguna, uuid, text, text, text),
  app.pilih_pejabat(public.pengguna, text, text), app.tanggal_isian(text, text), app.nomor_isian(text, text),
  app.arsip_paket(public.paket_pengadaan)
to service_role;

-- ---------------------------------------------------------------------
-- 15. Realtime
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'paket_pengadaan') then
    alter publication supabase_realtime add table public.paket_pengadaan;
  end if;
end $$;
