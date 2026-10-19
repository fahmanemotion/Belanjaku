-- =====================================================================
-- BELANJAKU — sisa anggaran (FA Detail) diperiksa saat PENGESAHAN, bukan saat mencatat belanja
--
-- • Catat / ubah dokumen belanja : nilai tidak lagi dibatasi sisa anggaran MAK di FA Detail.
--                                  MAK tetap harus ada di FA Detail (Kertas Kerja POK) yang aktif.
-- • Sahkan (buat_rekap_pengesahan): total kegiatan per MAK yang akan disahkan tidak boleh melebihi
--     sisa anggaran = pagu − lock − realisasi (FA Detail aktif)
--                     − kegiatan yang sudah disahkan sejak FA Detail itu diunggah
--   (pengesahan setelah FA Detail diunggah belum tercatat sebagai realisasi di FA Detail tersebut).
-- • RPC baru cek_anggaran_pengesahan(p_ids): rincian yang sama untuk ditampilkan di form Sahkan.
--
-- Jalankan sekali setelah 20261019103000_peran_operator_pengesahan.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Validasi isi dokumen belanja (catat & ubah) tanpa batas sisa anggaran
-- ---------------------------------------------------------------------
create or replace function app.periksa_isi_pengajuan(p jsonb, v_profil public.pengguna)
returns void language plpgsql stable security definer set search_path = ''
as $$
declare
  v_mak text := btrim(coalesce(p->>'mak', ''));
  v_dana text := p->>'dana';
  v_nilai numeric;
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
  if v_nilai > 999999999999999 then raise exception 'Nilai terlalu besar'; end if;
  if (p->>'tanggal') is null then raise exception 'Tanggal dokumen wajib diisi'; end if;
  -- Sisa anggaran MAK sengaja tidak diperiksa di sini; batasnya berlaku saat pengesahan.
  if app.sisa_mak(v_mak) is null then raise exception 'MAK % tidak ada di Kertas Kerja POK yang aktif', v_mak; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Rincian anggaran per MAK untuk kegiatan yang akan disahkan
--    ada          : MAK ada di FA Detail aktif
--    sisa_fa      : pagu − lock − realisasi pada FA Detail aktif
--    terpakai     : kegiatan MAK itu yang sudah disahkan sejak FA Detail diunggah
--    usul         : total kegiatan terpilih (belum disahkan) pada MAK itu
-- ---------------------------------------------------------------------
create or replace function app.anggaran_pengesahan(p_ids text[])
returns table (mak text, ada boolean, sisa_fa bigint, terpakai bigint, usul bigint, jumlah integer, berlaku_sejak timestamptz)
language sql stable security definer set search_path = ''
as $$
  with pilih as (
    select k.mak, sum(k.nilai)::bigint as usul, count(*)::integer as jumlah
    from public.pengajuan k
    where k.id = any(p_ids) and k.deleted_at is null and k.pengesahan_nomor is null
    group by k.mak
  ),
  fa as (
    select distinct on (m.kode) m.kode, (m.pagu - m.lock - m.realisasi)::bigint as sisa, u.created_at as diunggah
    from public.pok_mak m
    join public.pok_unggahan u on u.id = m.unggahan_id and u.aktif
    where m.kode in (select p.mak from pilih p)
    order by m.kode, u.tahun desc
  )
  select
    p.mak,
    fa.kode is not null,
    fa.sisa,
    coalesce((
      select sum(k.nilai)
      from public.pengajuan k
      join public.rekap_pengesahan rs on rs.nomor = k.pengesahan_nomor
      where k.mak = p.mak and k.deleted_at is null and rs.created_at >= fa.diunggah
    ), 0)::bigint,
    p.usul,
    p.jumlah,
    fa.diunggah
  from pilih p
  left join fa on fa.kode = p.mak
  order by p.mak
$$;

-- Tolak pengesahan bila ada MAK yang tidak ada di FA Detail atau sisa anggarannya tidak mencukupi
create or replace function app.periksa_anggaran_pengesahan(p_ids text[])
returns void language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tidak_ada text;
  v_kurang text;
begin
  select string_agg(a.mak, ', ' order by a.mak) into v_tidak_ada
  from app.anggaran_pengesahan(p_ids) a where not a.ada;
  if v_tidak_ada is not null then
    raise exception 'MAK % tidak ada di FA Detail (Kertas Kerja POK) yang aktif. Unggah FA Detail terbaru sebelum mengesahkan.', v_tidak_ada;
  end if;

  select string_agg(format('MAK %s: akan disahkan %s, sisa %s', a.mak, app.rupiah(a.usul), app.rupiah(a.sisa_fa - a.terpakai)), '; ' order by a.mak)
    into v_kurang
  from app.anggaran_pengesahan(p_ids) a
  where a.usul > a.sisa_fa - a.terpakai;
  if v_kurang is not null then
    raise exception 'Sisa anggaran tidak mencukupi — %. Hapus centang kegiatan pada MAK tersebut atau unggah FA Detail terbaru.', v_kurang;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Rekap pengesahan: sama seperti sebelumnya + pemeriksaan sisa anggaran per MAK
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
  -- Pengesahan dijalankan bergiliran agar dua operator tidak bersamaan memakai sisa anggaran yang sama
  perform pg_advisory_xact_lock(hashtext('belanjaku.pengesahan'));
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
  -- Sisa anggaran MAK pada FA Detail aktif berlaku di sini
  perform app.periksa_anggaran_pengesahan(v_ids);

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

-- ---------------------------------------------------------------------
-- 4. RPC baca: rincian sisa anggaran per MAK untuk form "Sahkan"
-- ---------------------------------------------------------------------
create or replace function public.cek_anggaran_pengesahan(p_ids text[])
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  perform app.wajib_izin('pengesahan.sahkan', 'memeriksa sisa anggaran pengesahan');
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'mak', a.mak, 'ada', a.ada, 'sisaFa', a.sisa_fa, 'terpakai', a.terpakai, 'usul', a.usul, 'jumlah', a.jumlah,
      'berlakuSejak', to_char(a.berlaku_sejak at time zone 'Asia/Makassar', 'YYYY-MM-DD"T"HH24:MI:SS'))) order by a.mak)
    from app.anggaran_pengesahan(p_ids) a
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Hak akses
-- ---------------------------------------------------------------------
revoke execute on function app.anggaran_pengesahan(text[]), app.periksa_anggaran_pengesahan(text[]) from public, anon, authenticated;
grant execute on function app.anggaran_pengesahan(text[]), app.periksa_anggaran_pengesahan(text[]) to service_role;
revoke execute on function public.cek_anggaran_pengesahan(text[]) from public, anon;
grant execute on function public.cek_anggaran_pengesahan(text[]) to authenticated, service_role;
