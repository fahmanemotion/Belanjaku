-- =====================================================================
-- ROLLBACK skema Belanjaku (kebalikan 20261018210500_belanjaku_skema.sql)
-- PERINGATAN: menghapus SEMUA data Belanjaku (pengajuan, pengguna, aktivitas, POK).
-- Akun login di Supabase Auth tidak ikut terhapus.
-- =====================================================================
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime drop table
        public.pengajuan, public.spp, public.pengesahan, public.aktivitas, public.pok_unggahan,
        public.pengguna, public.unit_kerja, public.penyedia, public.akun, public.sumber_dana;
    exception when others then null;
    end;
  end if;
end $$;

drop policy if exists "fa-detail: unggah oleh admin & operator" on storage.objects;
drop policy if exists "fa-detail: dibaca pengguna aktif" on storage.objects;
drop policy if exists "fa-detail: hapus unggahan sendiri" on storage.objects;
delete from storage.buckets where id = 'fa-detail' and not exists (select 1 from storage.objects where bucket_id = 'fa-detail');

drop trigger if exists belanjaku_pengguna_baru on auth.users;

drop function if exists public.admin_catat_sandi(uuid, uuid);
drop function if exists public.admin_hapus_pengguna(uuid, uuid);
drop function if exists public.admin_ubah_pengguna(uuid, uuid, text, text, text, text, boolean);
drop function if exists public.admin_tambah_pengguna(uuid, uuid, text, text, text, text);
drop function if exists public.pok_aktif(integer);
drop function if exists public.terapkan_pok(jsonb, text, text);
drop function if exists public.simpan_referensi(text, jsonb, text);
drop function if exists public.jejak_dokumen(text);
drop function if exists public.catat_aktivitas(text, text, text, text, text);
drop function if exists public.sahkan_pengajuan(text[]);
drop function if exists public.majukan_tahap_spp(text);
drop function if exists public.buat_spp(text, text, date);
drop function if exists public.ubah_status_pengajuan(text, text, text);
drop function if exists public.hapus_pengajuan(text, text);
drop function if exists public.ubah_pengajuan(text, jsonb, text);
drop function if exists public.buat_pengajuan(jsonb);

drop view if exists public.v_pengajuan;
drop table if exists public.pok_item, public.pok_mak, public.pok_uraian, public.pok_unggahan cascade;
drop table if exists public.aktivitas, public.pengesahan, public.sp3b, public.spp, public.pengajuan cascade;
drop table if exists public.pengguna, public.penyedia, public.akun, public.sumber_dana, public.unit_kerja, public.izin_peran cascade;
drop schema if exists app cascade;
