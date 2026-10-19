/**
 * Aturan & format modul Pengadaan (alur dokumen Kwitansi).
 * Perhitungan jumlah, PPN, dan pola nomor di sini SAMA dengan fungsi database
 * (app.jumlah_item, app.total_ppn di supabase/migrations/20261020090000_pengadaan_kwitansi.sql).
 */
import { terbilang } from "./format";
import type { DataPejabat, DataPenyedia, ItemPaket, Paket, Pengguna, RefPenyedia, TahapPaket } from "./types";

/* ---------- Tahap ---------- */
export const TAHAP: { tahap: TahapPaket; nama: string; singkat: string; pelaku: "PPK" | "Pejabat Pengadaan"; dokumen: string }[] = [
  { tahap: 1, nama: "Nota Dinas & HPS", singkat: "Nota Dinas", pelaku: "PPK", dokumen: "Nota Dinas Perintah Pengadaan Barang/Jasa dan HPS" },
  { tahap: 2, nama: "Surat Pesanan", singkat: "Surat Pesanan", pelaku: "Pejabat Pengadaan", dokumen: "Surat Pesanan kepada penyedia" },
  { tahap: 3, nama: "Nota Pembelian", singkat: "Nota Pembelian", pelaku: "Pejabat Pengadaan", dokumen: "Nota / Bukti Pembelian dari penyedia" },
  { tahap: 4, nama: "Kwitansi, BAP & BAST", singkat: "Kwitansi", pelaku: "PPK", dokumen: "Kwitansi, BAP, BAST beserta lampirannya" },
];

/* ---------- Dokumen cetak (urutan sesuai sheet Excel) ---------- */
export type KodeDokumen = "nd" | "hps" | "sp" | "nota" | "kw" | "lampKw" | "bap" | "lampBap" | "bast" | "lampBast";

export const DOKUMEN: { kode: KodeDokumen; nama: string; tahap: TahapPaket }[] = [
  { kode: "nd", nama: "Nota Dinas", tahap: 1 },
  { kode: "hps", nama: "HPS", tahap: 1 },
  { kode: "sp", nama: "Surat Pesanan", tahap: 2 },
  { kode: "nota", nama: "Nota Pembelian", tahap: 3 },
  { kode: "kw", nama: "Kwitansi", tahap: 4 },
  { kode: "lampKw", nama: "Lampiran Kwitansi", tahap: 4 },
  { kode: "bap", nama: "BAP", tahap: 4 },
  { kode: "lampBap", nama: "Lampiran BAP", tahap: 4 },
  { kode: "bast", nama: "BAST", tahap: 4 },
  { kode: "lampBast", nama: "Lampiran BAST", tahap: 4 },
];

/** Dokumen yang terbit pada satu tahap */
export const dokumenTahap = (t: TahapPaket) => DOKUMEN.filter((d) => d.tahap === t).map((d) => d.kode);

/* ---------- Jumlah & PPN ---------- */
export const PERSEN_PPN = 11;

/** PPN 11% dibulatkan ke rupiah terdekat — sama dengan (jumlah × 11 + 50) / 100 di database */
export const hitungPpn = (jumlah: number) => Math.floor((jumlah * PERSEN_PPN + 50) / 100);

export interface Total {
  jumlah: number;
  ppn: number;
  total: number;
}

/** Jumlah (Σ jumlah × harga satuan), PPN, dan total untuk harga HPS atau harga pembelian */
export function hitungTotal(item: Pick<ItemPaket, "jumlah" | "hargaHps" | "harga">[], kolom: "hargaHps" | "harga", ppn: boolean): Total {
  const jumlah = item.reduce((s, x) => s + (Number(x.jumlah) || 0) * (Number(x[kolom]) || 0), 0);
  const p = ppn ? hitungPpn(jumlah) : 0;
  return { jumlah, ppn: p, total: jumlah + p };
}

export const totalHps = (p: Paket) => hitungTotal(p.item, "hargaHps", p.ppn);
export const totalBeli = (p: Paket) => hitungTotal(p.item, "harga", p.nota?.ppn ?? p.ppn);
/** Nilai paket yang paling mutakhir: total pembelian bila nota sudah dicatat, selain itu total HPS */
export const nilaiPaket = (p: Paket) => (p.tahap >= 3 ? totalBeli(p).total : totalHps(p).total);

/* ---------- Teks dokumen ---------- */
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const ROMAWI = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

const bagian = (iso: string) => {
  const [y, m, d] = (iso ?? "").slice(0, 10).split("-").map(Number);
  return y && m && d ? { y, m, d } : null;
};

/** 43168500 → 43.168.500 */
export const angka = (n: number) => (n < 0 ? "-" : "") + Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Huruf besar di awal setiap kata: "empat puluh" → "Empat Puluh" */
export const kapitalKata = (s: string) => s.replace(/(^|\s)(\S)/g, (_, a: string, b: string) => a + b.toUpperCase());

/** 47917035 → "Empat Puluh Tujuh Juta Sembilan Ratus Tujuh Belas Ribu Tiga Puluh Lima Rupiah." */
export const terbilangRupiah = (n: number) => `${kapitalKata(terbilang(n).replace(/ rupiah$/, ""))} Rupiah.`;

/** 2026 → "Dua Ribu Dua Puluh Enam" */
export const kataBilangan = (n: number) => kapitalKata(terbilang(n).replace(/ rupiah$/, ""));

/** 2026-10-01 → 01 Oktober 2026 (format tanggal di dokumen Excel) */
export function tanggalSurat(iso?: string): string {
  const b = iso ? bagian(iso) : null;
  return b ? `${String(b.d).padStart(2, "0")} ${BULAN[b.m - 1]} ${b.y}` : "…………………";
}

/** 2025-12-01 → 1 Desember 2025 (tanggal SK di BAP) */
export function tanggalSk(iso?: string): string {
  const b = iso ? bagian(iso) : null;
  return b ? `${b.d} ${BULAN[b.m - 1]} ${b.y}` : "…………………";
}

/** 2026-10-08 → { hari: "Kamis", tanggal: "Delapan Bulan Oktober Tahun Dua Ribu Dua Puluh Enam" } (BAP & BAST) */
export function hariTanggalKata(iso?: string): { hari: string; tanggal: string } {
  const b = iso ? bagian(iso) : null;
  if (!b) return { hari: "…………", tanggal: "…………………………" };
  const hari = HARI[new Date(Date.UTC(b.y, b.m - 1, b.d)).getUTCDay()];
  return { hari, tanggal: `${kataBilangan(b.d)} Bulan ${BULAN[b.m - 1]} Tahun ${kataBilangan(b.y)}` };
}

/** Bulan Romawi dari tanggal ISO: 2026-10-08 → X */
export function romawiBulan(iso?: string): string {
  const b = iso ? bagian(iso) : null;
  return b ? ROMAWI[b.m - 1] : "…";
}

export const tahunDari = (iso?: string, cadangan = new Date().getFullYear()) => (iso ? bagian(iso)?.y ?? cadangan : cadangan);

/** Baris spesifikasi dicetak dengan tanda "- " seperti di Excel */
export const barisSpesifikasi = (s: string) => (/^[-–•*]/.test(s.trim()) ? s.trim() : `- ${s.trim()}`);

/* ---------- Pola nomor dokumen (sesuai sheet Form) ---------- */
export type JenisNomor = "nd" | "sp" | "kw" | "bap" | "bast";

/**
 * Bagian tetap di depan & belakang nomor; bagian tengah diisi pengguna (nomor agenda atau kode paket):
 *   Nota Dinas : PL.102/PPK/KO-RM/[100142]/X/PIP.MKS-2026
 *   SP         : PL.102/PP/KO-RM/[100143]/X/PIP.MKS-2026
 *   Kwitansi   : PL.102/PPK/KO-RM/[100802]/X/PIP.MKS-2026
 *   BAP        : PL.102/PPK-RM/BAP/[CINDERAMATA-KERJASAMA]/X/2026
 *   BAST       : PL.102/PPK-RM/BAST/[CINDERAMATA-KERJASAMA]/X/PIP.MKS-2026
 */
export function polaNomor(jenis: JenisNomor, dana: string, tanggalIso: string): { awal: string; akhir: string; contoh: string } {
  const r = romawiBulan(tanggalIso);
  const t = tahunDari(tanggalIso);
  const d = dana || "RM";
  switch (jenis) {
    case "nd":
      return { awal: `PL.102/PPK/KO-${d}/`, akhir: `/${r}/PIP.MKS-${t}`, contoh: "100142" };
    case "sp":
      return { awal: `PL.102/PP/KO-${d}/`, akhir: `/${r}/PIP.MKS-${t}`, contoh: "100143" };
    case "kw":
      return { awal: `PL.102/PPK/KO-${d}/`, akhir: `/${r}/PIP.MKS-${t}`, contoh: "100802" };
    case "bap":
      return { awal: `PL.102/PPK-${d}/BAP/`, akhir: `/${r}/${t}`, contoh: "CINDERAMATA-KERJASAMA" };
    case "bast":
      return { awal: `PL.102/PPK-${d}/BAST/`, akhir: `/${r}/PIP.MKS-${t}`, contoh: "CINDERAMATA-KERJASAMA" };
  }
}

/** Ambil bagian tengah nomor bila nomor mengikuti pola (awal & akhir diabaikan bulan/tahunnya); null bila tidak */
export function tengahNomor(jenis: JenisNomor, nomor: string): string | null {
  const pola: Record<JenisNomor, RegExp> = {
    nd: /^PL\.102\/PPK\/KO-[A-Z]+\/(.+)\/[IVX]+\/PIP\.MKS-\d{4}$/,
    sp: /^PL\.102\/PP\/KO-[A-Z]+\/(.+)\/[IVX]+\/PIP\.MKS-\d{4}$/,
    kw: /^PL\.102\/PPK\/KO-[A-Z]+\/(.+)\/[IVX]+\/PIP\.MKS-\d{4}$/,
    bap: /^PL\.102\/PPK-[A-Z]+\/BAP\/(.+)\/[IVX]+\/\d{4}$/,
    bast: /^PL\.102\/PPK-[A-Z]+\/BAST\/(.+)\/[IVX]+\/PIP\.MKS-\d{4}$/,
  };
  return pola[jenis].exec(nomor.trim())?.[1] ?? null;
}

/* ---------- Data cetak: arsip paket (setelah kwitansi terbit) atau data terkini ---------- */
export function dataPejabat(u?: Pengguna): DataPejabat | undefined {
  if (!u) return undefined;
  return { id: u.id, nama: u.nama, nip: u.nip, pangkat: u.pangkat, skNomor: u.skNomor, skTanggal: u.skTanggal };
}

export function dataPenyedia(p?: RefPenyedia): DataPenyedia | undefined {
  if (!p) return undefined;
  return { id: p.id, nama: p.nama, pimpinan: p.pimpinan, jabatan: p.jabatan, alamat: p.alamat, kota: p.kota, npwp: p.npwp, bank: p.bank, rekening: p.rekening };
}

/** Data penyedia yang wajib ada untuk dokumen (Surat Pesanan s.d. Kwitansi) */
export function kurangPenyedia(p?: Partial<DataPenyedia>): string[] {
  if (!p) return ["penyedia"];
  return [
    !p.pimpinan?.trim() && "nama pimpinan",
    !p.jabatan?.trim() && "jabatan pimpinan",
    !p.alamat?.trim() && "alamat",
    !p.npwp?.trim() && "NPWP",
    !p.bank?.trim() && "bank",
    !p.rekening?.trim() && "nomor rekening",
  ].filter(Boolean) as string[];
}

/** Data penanda tangan yang belum diisi (NIP & pangkat; SK untuk PPK karena dicetak di BAP) */
export function kurangPejabat(p: DataPejabat | undefined, ppk: boolean): string[] {
  if (!p) return [];
  return [!p.nip && "NIP", !p.pangkat && "pangkat/golongan", ppk && !p.skNomor && "nomor SK", ppk && !p.skTanggal && "tanggal SK"].filter(Boolean) as string[];
}

/** NIP dicetak apa adanya; kosong → titik-titik */
export const nipCetak = (nip?: string) => nip?.trim() || "……………………………";
