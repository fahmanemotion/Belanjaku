/**
 * MATA ANGGARAN KEGIATAN (MAK) & KERTAS KERJA POK
 * ------------------------------------------------
 * Sumber data: Laporan Realisasi SP2D "FA Detail 16 Segmen" (GLP039) dari SAKTI,
 * disimpan di database (tabel pok_unggahan, pok_mak, pok_item; dibaca lewat RPC pok_aktif).
 * Operator/admin mengganti datanya lewat tombol "Upload FA Detail" di Dashboard (lib/faDetail.ts).
 *
 * Format kode MAK: Kegiatan.KRO.RO.Komponen.SubKomponen.Akun   contoh 1975.DAB.002.051.A.521211
 * Sumber dana tidak tercantum di FA Detail, jadi ditentukan dari kode akun:
 *   525xxx (Barang BLU) dan 537xxx (Modal BLU) = BLU, akun lainnya = RM.
 */
/** [kode MAK, pagu, lock pagu, realisasi s.d. periode] */
export type BarisMakMentah = [kode: string, pagu: number, lock: number, realisasi: number];
/** [nomor item, uraian item, pagu, lock pagu, realisasi s.d. periode] */
export type ItemMentah = [no: string, uraian: string, pagu: number, lock: number, realisasi: number];

/** Isi satu file FA Detail dalam bentuk ringkas (mudah disimpan / dikirim ke database) */
export interface DataPok {
  /** diunggah & oleh kosong untuk data awal yang dipasang bersama database */
  sumber: { file: string; periode: string; satker: string; tahun?: number; diunggah?: string; oleh?: string };
  /** uraian tiap level kode: "1975", "1975.DAB", "1975.DAB.002", "…051", "…051.A" */
  uraian: Record<string, string>;
  /** nama akun: "521211" → "Belanja Bahan" */
  akun: Record<string, string>;
  mak: BarisMakMentah[];
  /** rincian item per kode MAK (kosong bila laporan hanya sampai level akun) */
  item: Record<string, ItemMentah[]>;
}

export interface LevelMak {
  kode: string;
  uraian: string;
}

export interface InfoMak {
  kode: string;
  akun: string;
  akunUraian: string;
  /** sumber dana hasil validasi dari kode akun */
  dana: "RM" | "BLU";
  kegiatan: LevelMak;
  kro: LevelMak;
  ro: LevelMak;
  komponen: LevelMak;
  subKomponen: LevelMak;
  pagu: number;
  lock: number;
  realisasi: number;
  /** pagu − lock − realisasi */
  sisa: number;
}

/** Satu baris tabel Kertas Kerja POK: item (bila ada) atau MAK (bila laporan tanpa item) */
export interface BarisPok {
  id: string;
  /** uraian item; bila tanpa item: uraian sub komponen */
  uraian: string;
  /** keterangan kecil di bawah uraian: sub komponen (untuk item) atau komponen (untuk MAK) */
  konteks: string;
  noItem?: string;
  mak: InfoMak;
  pagu: number;
  lock: number;
  realisasi: number;
  sisa: number;
}

/** Akun = segmen terakhir kode MAK */
export const akunDariMak = (kode: string) => kode.split(".").pop() ?? "";

/** Validasi sumber dana dari kode akun: 525xxx & 537xxx = BLU, selain itu RM */
export const danaDariAkun = (akun: string): "RM" | "BLU" => (akun.startsWith("525") || akun.startsWith("537") ? "BLU" : "RM");

export function susunDaftarMak(d: DataPok): InfoMak[] {
  return d.mak.map(([kode, pagu, lock, realisasi]) => {
    const s = kode.split(".");
    const level = (n: number): LevelMak => ({ kode: s[n - 1], uraian: d.uraian[s.slice(0, n).join(".")] ?? "-" });
    return {
      kode,
      akun: s[5],
      akunUraian: d.akun[s[5]] ?? "-",
      dana: danaDariAkun(s[5]),
      kegiatan: level(1),
      kro: level(2),
      ro: level(3),
      komponen: level(4),
      subKomponen: level(5),
      pagu,
      lock,
      realisasi,
      sisa: pagu - lock - realisasi,
    };
  });
}

export function susunBarisPok(d: DataPok, daftar: InfoMak[]): BarisPok[] {
  const hasil: BarisPok[] = [];
  for (const m of daftar) {
    const items = d.item[m.kode];
    if (items?.length) {
      items.forEach(([no, uraian, pagu, lock, realisasi], i) =>
        hasil.push({ id: `${m.kode}#${no}#${i}`, uraian, konteks: m.subKomponen.uraian, noItem: no, mak: m, pagu, lock, realisasi, sisa: pagu - lock - realisasi }),
      );
    } else {
      hasil.push({ id: m.kode, uraian: m.subKomponen.uraian, konteks: m.komponen.uraian, mak: m, pagu: m.pagu, lock: m.lock, realisasi: m.realisasi, sisa: m.sisa });
    }
  }
  return hasil;
}
