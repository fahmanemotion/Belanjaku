/**
 * Akses data Supabase untuk browser: pemetaan baris database → tipe aplikasi (lib/types.ts),
 * pemuat data per tabel, dan penerjemah pesan galat.
 * Semua pembacaan dibatasi Row Level Security; semua perubahan lewat RPC (lihat supabase/migrations).
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { labelJenisAkun } from "./data";
import type { DataPok } from "./mak";
import type { Aktivitas, JenisPencairan, Kegiatan, Pengguna, Peran, Referensi, Rekap, StatusBelanja, SumberDana } from "./types";

/* ---------- Galat ---------- */
type Galat = Pick<PostgrestError, "message"> & { code?: string };

export function pesanGalat(e: Galat | Error | null | undefined): string {
  if (!e) return "Terjadi kesalahan";
  const m = e.message ?? String(e);
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(m)) return "Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.";
  if (/JWT expired|invalid JWT|Sesi tidak valid/i.test(m)) return "Sesi berakhir atau akun dinonaktifkan. Silakan masuk kembali.";
  if (/permission denied/i.test(m)) return "Anda tidak berwenang melakukan aksi ini";
  if (/Could not find the function/i.test(m)) return "Database belum diperbarui ke versi aplikasi ini. Hubungi Administrator.";
  return m;
}

/** Waktu database (timestamptz) → waktu lokal Makassar tanpa zona: 2026-10-18T13:38:05 */
export function waktuLokal(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 19);
}

/** Ambil semua baris walau melebihi batas 1.000 baris per permintaan API */
export async function ambilSemua<T>(
  muat: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  ukuran = 1000,
): Promise<T[]> {
  const hasil: T[] = [];
  for (let dari = 0; ; dari += ukuran) {
    const { data, error } = await muat(dari, dari + ukuran - 1);
    if (error) throw error;
    hasil.push(...(data ?? []));
    if (!data || data.length < ukuran) return hasil;
  }
}

/* ---------- Pemetaan baris ---------- */
interface BarisVPengajuan {
  id: string;
  uraian: string;
  no_dokumen: string;
  jenis_dokumen: Kegiatan["jenisDokumen"];
  penyedia_id: string;
  penyedia: string;
  dana: Kegiatan["dana"];
  mak: string;
  akun: string;
  unit: string;
  nilai: number;
  tanggal: string;
  status: StatusBelanja;
  dibuat_oleh: string;
  pencairan_nomor: string | null;
  pencairan_tanggal: string | null;
  pencairan_jenis: JenisPencairan | null;
  pengesahan_nomor: string | null;
  pengesahan_tanggal: string | null;
}

export function keKegiatan(r: BarisVPengajuan): Kegiatan {
  return {
    id: r.id,
    uraian: r.uraian,
    noDokumen: r.no_dokumen,
    jenisDokumen: r.jenis_dokumen,
    penyediaId: r.penyedia_id,
    penyedia: r.penyedia,
    dana: r.dana,
    mak: r.mak,
    akun: r.akun,
    unit: r.unit,
    nilai: Number(r.nilai),
    tanggal: r.tanggal,
    status: r.status,
    dibuatOleh: r.dibuat_oleh,
    pencairan: r.pencairan_nomor ? { nomor: r.pencairan_nomor, tanggal: r.pencairan_tanggal!, jenis: r.pencairan_jenis! } : undefined,
    pengesahan: r.pengesahan_nomor ? { nomor: r.pengesahan_nomor, tanggal: r.pengesahan_tanggal! } : undefined,
  };
}

/** Dokumen hasil RPC (sudah berbentuk Kegiatan; angka dijamin number) */
export const rapikanKegiatan = (k: Kegiatan): Kegiatan => ({ ...k, nilai: Number(k.nilai) });

/** Rekap hasil RPC (sudah berbentuk Rekap; angka dijamin number) */
export const rapikanRekap = (r: Rekap): Rekap => ({ ...r, jumlah: Number(r.jumlah), total: Number(r.total) });

interface BarisRekap {
  nomor: string;
  tanggal: string;
  dana: SumberDana;
  jenis?: JenisPencairan;
  referensi: string | null;
  catatan: string | null;
  jumlah: number;
  total: number;
  dibuat_oleh: string;
  created_at: string;
}

const keRekap = (r: BarisRekap, jenisRekap: Rekap["jenisRekap"]): Rekap => ({
  nomor: r.nomor,
  jenisRekap,
  tanggal: r.tanggal,
  dana: r.dana,
  jenisBayar: r.jenis ?? undefined,
  referensi: r.referensi ?? undefined,
  catatan: r.catatan ?? undefined,
  jumlah: Number(r.jumlah),
  total: Number(r.total),
  dibuatOleh: r.dibuat_oleh,
  dibuatPada: waktuLokal(r.created_at),
});

interface BarisPengguna {
  id: string;
  nama: string;
  email: string;
  peran: Peran;
  aktif: boolean;
  deleted_at: string | null;
}

export const kePengguna = (r: BarisPengguna): Pengguna => ({
  id: r.id,
  nama: r.nama,
  email: r.email,
  peran: r.peran,
  aktif: r.aktif && !r.deleted_at,
  dihapus: Boolean(r.deleted_at),
});

interface BarisAktivitas {
  id: number | string;
  waktu: string;
  oleh: string;
  jenis: Aktivitas["jenis"];
  modul: Aktivitas["modul"];
  aksi: string;
  objek_id: string | null;
  objek_label: string | null;
  perubahan: Aktivitas["perubahan"] | null;
  catatan: string | null;
}

export const keAktivitas = (r: BarisAktivitas): Aktivitas => ({
  id: String(r.id),
  waktu: waktuLokal(r.waktu),
  oleh: r.oleh,
  jenis: r.jenis,
  modul: r.modul,
  aksi: r.aksi,
  objekId: r.objek_id ?? undefined,
  objekLabel: r.objek_label ?? undefined,
  perubahan: r.perubahan ?? undefined,
  catatan: r.catatan ?? undefined,
});

/* ---------- Pemuat data ---------- */
export async function muatKegiatan(sb: SupabaseClient): Promise<Kegiatan[]> {
  const baris = await ambilSemua<BarisVPengajuan>((dari, sampai) =>
    sb.from("v_pengajuan").select("*").order("id", { ascending: false }).range(dari, sampai),
  );
  return baris.map(keKegiatan);
}

/** Semua rekap pencairan & pengesahan, terbaru di atas */
export async function muatRekap(sb: SupabaseClient): Promise<Rekap[]> {
  const kolom = "nomor, tanggal, dana, referensi, catatan, jumlah, total, dibuat_oleh, created_at";
  const [cair, sah] = await Promise.all([
    ambilSemua<BarisRekap>((dari, sampai) =>
      sb.from("rekap_pencairan").select(`${kolom}, jenis`).order("created_at", { ascending: false }).range(dari, sampai),
    ),
    ambilSemua<BarisRekap>((dari, sampai) =>
      sb.from("rekap_pengesahan").select(kolom).order("created_at", { ascending: false }).range(dari, sampai),
    ),
  ]);
  return [...cair.map((r) => keRekap(r, "pencairan")), ...sah.map((r) => keRekap(r, "pengesahan"))];
}

export async function muatPengguna(sb: SupabaseClient): Promise<Pengguna[]> {
  const { data, error } = await sb.from("pengguna").select("id, nama, email, peran, aktif, deleted_at").order("nama");
  if (error) throw error;
  return (data as BarisPengguna[]).map(kePengguna);
}

export async function muatReferensi(sb: SupabaseClient): Promise<Referensi> {
  const [unit, akun, penyedia, dana] = await Promise.all([
    sb.from("unit_kerja").select("kode, nama, penanggung_jawab").eq("aktif", true).order("kode"),
    sb.from("akun").select("kode, uraian").order("kode"),
    sb.from("penyedia").select("id, nama, bidang, kota, aktif").order("nama"),
    sb.from("sumber_dana").select("kode, nama, warna").order("kode"),
  ]);
  for (const r of [unit, akun, penyedia, dana]) if (r.error) throw r.error;
  return {
    unit: (unit.data ?? []).map((u) => ({ kode: u.kode, nama: u.nama, penanggungJawab: u.penanggung_jawab })),
    akun: (akun.data ?? []).map((a) => ({ kode: a.kode, uraian: a.uraian, jenis: labelJenisAkun(a.kode) })),
    penyedia: (penyedia.data ?? []).map((p) => ({ id: p.id, nama: p.nama, bidang: p.bidang, kota: p.kota, aktif: p.aktif })),
    dana: (dana.data ?? []).map((d) => ({ kode: d.kode, nama: d.nama, warna: d.warna })),
  };
}

/** 1.000 aktivitas terbaru; riwayat lengkap satu dokumen lewat jejakDokumen() */
export async function muatAktivitas(sb: SupabaseClient): Promise<Aktivitas[]> {
  const { data, error } = await sb
    .from("aktivitas")
    .select("id, waktu, oleh, jenis, modul, aksi, objek_id, objek_label, perubahan, catatan")
    .order("waktu", { ascending: false })
    .order("id", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data as BarisAktivitas[]).map(keAktivitas);
}

export async function muatPok(sb: SupabaseClient): Promise<DataPok | null> {
  const { data, error } = await sb.rpc("pok_aktif");
  if (error) throw error;
  if (!data) return null;
  const d = data as DataPok;
  // angka dari database bisa berupa teks untuk bigint besar → pastikan number
  return {
    ...d,
    mak: d.mak.map(([k, p, l, r]) => [k, Number(p), Number(l), Number(r)]),
    item: Object.fromEntries(Object.entries(d.item).map(([k, xs]) => [k, xs.map(([n, u, p, l, r]) => [n, u, Number(p), Number(l), Number(r)])])),
  };
}

export async function muatIzin(sb: SupabaseClient, peran: Peran): Promise<string[]> {
  const { data, error } = await sb.from("izin_peran").select("izin").eq("peran", peran);
  if (error) throw error;
  return (data ?? []).map((x) => x.izin as string);
}
