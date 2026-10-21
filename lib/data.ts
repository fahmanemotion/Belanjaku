/**
 * Konstanta aplikasi + DATA CONTOH untuk panel Dashboard yang belum punya sumber data asli
 * (grafik Target vs Realisasi, target per jenis belanja, kartu BLU & RM).
 * Data transaksi (pengajuan, pencairan, pengesahan, pengguna, referensi, aktivitas, Kertas Kerja POK)
 * sudah diambil dari database Supabase — lihat components/StoreProvider.tsx dan lib/db.ts.
 */
import type { JenisAktivitas, JenisDokumen, JenisPencairan, ModulAktivitas, Peran, StatusBelanja } from "./types";

export const TAHUN_ANGGARAN = 2026;
export const KODE_DIPA = "DIPA 022.12.4.287494";

/* ---------- Sumber dana & jenis belanja ---------- */

export type Dana = "RM" | "BLU";
export type FilterDana = "Gabung" | Dana;
export type JenisBelanja = "Pegawai" | "Barang" | "Modal";

export const FILTER_DANA: FilterDana[] = ["Gabung", "RM", "BLU"];

/** Sumber dana yang tabelnya dipisah di Pengadaan, Belanja, Pencairan, dan Pengesahan (tombol RM | BLU) */
export const DAFTAR_DANA: Dana[] = ["RM", "BLU"];
export const NAMA_DANA: Record<Dana, string> = { RM: "Rupiah Murni", BLU: "PNBP BLU" };

/**
 * Jenis belanja ditentukan dari 2 digit depan kode akun:
 * 51 = Belanja Pegawai, 52 = Belanja Barang, 53 = Belanja Modal.
 */
/**
 * Akun yang boleh dipakai sesuai sumber dana.
 * - BLU : 525… (Belanja Barang BLU) dan 537… (Belanja Modal BLU)
 * - RM  : 51… (Pegawai), 52… selain 525, dan 53… selain 537
 */
export function akunSesuaiDana(akun: string, dana: string): boolean {
  if (dana === "BLU") return akun.startsWith("525") || akun.startsWith("537");
  return (
    akun.startsWith("51") ||
    (akun.startsWith("52") && !akun.startsWith("525")) ||
    (akun.startsWith("53") && !akun.startsWith("537"))
  );
}

export const ATURAN_AKUN: Record<string, string> = {
  RM: "Akun RM: 51 (Pegawai), 52 selain 525 (Barang), 53 selain 537 (Modal)",
  BLU: "Akun BLU: 525 (Barang BLU) dan 537 (Modal BLU)",
};

export function jenisBelanjaDariAkun(akun: string): "Pegawai" | "Barang" | "Modal" | null {
  const awal = akun.slice(0, 2);
  if (awal === "51") return "Pegawai";
  if (awal === "52") return "Barang";
  if (awal === "53") return "Modal";
  return null;
}
export const JENIS_BELANJA: { kode: JenisBelanja; nama: string; akun: string; warna: string }[] = [
  { kode: "Pegawai", nama: "Belanja Pegawai", akun: "51 / 5251", warna: "var(--info)" },
  { kode: "Barang", nama: "Belanja Barang", akun: "52 / 5251", warna: "var(--accent)" },
  { kode: "Modal", nama: "Belanja Modal", akun: "53 / 537", warna: "var(--good)" },
];

export const BULAN_GRAFIK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt"];

/** Realisasi belanja per bulan (rupiah). Okt = bulan berjalan. */
export const REALISASI_BULANAN: Record<Dana, number[]> = {
  RM: [
    1_902_400_000, 2_215_800_000, 2_398_650_000, 2_310_200_000, 2_287_900_000,
    2_405_330_000, 2_612_480_000, 2_301_150_000, 2_396_700_000, 2_270_390_000,
  ],
  BLU: [
    1_604_250_000, 2_897_600_000, 4_312_450_000, 3_985_300_000, 2_610_770_000,
    3_890_250_000, 5_020_410_000, 4_480_890_000, 4_204_120_000, 2_213_960_000,
  ],
};

/** Rencana penarikan dana per bulan (rupiah) */
export const RENCANA_BULANAN: Record<Dana, number[]> = {
  RM: [
    2_300_000_000, 2_500_000_000, 2_600_000_000, 2_600_000_000, 2_600_000_000,
    2_600_000_000, 2_800_000_000, 2_700_000_000, 2_700_000_000, 2_700_000_000,
  ],
  BLU: [
    2_400_000_000, 3_400_000_000, 4_600_000_000, 4_800_000_000, 4_200_000_000,
    4_800_000_000, 5_400_000_000, 5_200_000_000, 5_100_000_000, 5_400_000_000,
  ],
};

export const jumlah = (a: number[]) => a.reduce((s, x) => s + x, 0);

/**
 * Pagu & realisasi per jenis belanja per sumber dana.
 * Realisasi Belanja Barang dihitung sebagai sisa dari total realisasi bulanan,
 * sehingga total per jenis selalu sama dengan total di grafik.
 */
function susunJenis(dana: Dana, pagu: Record<JenisBelanja, number>, realPegawai: number, realModal: number) {
  const total = jumlah(REALISASI_BULANAN[dana]);
  return {
    Pegawai: { pagu: pagu.Pegawai, realisasi: realPegawai },
    Barang: { pagu: pagu.Barang, realisasi: total - realPegawai - realModal },
    Modal: { pagu: pagu.Modal, realisasi: realModal },
  } satisfies Record<JenisBelanja, { pagu: number; realisasi: number }>;
}

export const PAGU_JENIS: Record<Dana, Record<JenisBelanja, { pagu: number; realisasi: number }>> = {
  RM: susunJenis("RM", { Pegawai: 24_800_000_000, Barang: 4_900_000_000, Modal: 1_500_000_000 }, 19_642_150_000, 412_600_000),
  BLU: susunJenis("BLU", { Pegawai: 18_400_000_000, Barang: 33_750_000_000, Modal: 12_700_000_000 }, 13_905_400_000, 3_368_750_000),
};

/* =========================================================
   Target (rencana penarikan) vs realisasi — untuk grafik
   ========================================================= */

export const BULAN_12 = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const TAHUN_BERJALAN = 2026;
/** Bulan berjalan (1–12). Bulan ini belum tutup buku, jadi tidak dihitung dalam deviasi. */
export const BULAN_BERJALAN = 10;

/** Pola penarikan dana tahunan (bobot per bulan) — khas satker: menumpuk di akhir tahun */
const BOBOT_PENARIKAN = [5, 6.5, 8, 8, 7.5, 8.5, 9, 8.5, 8.5, 8.5, 9, 13];

/** Bagi total ke 12 bulan sesuai bobot; selisih pembulatan masuk Desember agar total tepat tanpa sisa */
function sebar(total: number, bobot: number[]): number[] {
  const s = jumlah(bobot);
  const hasil = bobot.map((b) => Math.round((total * b) / s / 1e6) * 1e6);
  hasil[hasil.length - 1] += total - jumlah(hasil);
  return hasil;
}
const kali = (rencana: number[], faktor: number[]) => rencana.map((r, i) => Math.round((r * faktor[i]) / 1e6) * 1e6);

export interface SeriDana {
  pagu: number;
  /** 12 bulan */
  rencana: number[];
  /** bisa kurang dari 12 bulan untuk tahun berjalan */
  realisasi: number[];
}

const RENCANA_2026: Record<Dana, number[]> = {
  RM: [...RENCANA_BULANAN.RM, 2_400_000_000, 2_700_000_000],
  BLU: [...RENCANA_BULANAN.BLU, 7_000_000_000, 12_550_000_000],
};

function seriLampau(pagu: number, faktor: number[]): SeriDana {
  const rencana = sebar(pagu, BOBOT_PENARIKAN);
  return { pagu, rencana, realisasi: kali(rencana, faktor) };
}

export const SERI_BULANAN: Record<number, Record<Dana, SeriDana>> = {
  2026: {
    RM: { pagu: jumlah(RENCANA_2026.RM), rencana: RENCANA_2026.RM, realisasi: REALISASI_BULANAN.RM },
    BLU: { pagu: jumlah(RENCANA_2026.BLU), rencana: RENCANA_2026.BLU, realisasi: REALISASI_BULANAN.BLU },
  },
  2025: {
    RM: seriLampau(29_400_000_000, [0.86, 0.9, 0.92, 0.95, 0.97, 0.96, 0.98, 0.97, 0.99, 0.98, 1.0, 0.99]),
    BLU: seriLampau(58_600_000_000, [0.62, 0.78, 0.85, 0.88, 0.84, 0.92, 0.95, 0.93, 0.97, 0.96, 1.02, 1.03]),
  },
  2024: {
    RM: seriLampau(27_800_000_000, [0.8, 0.88, 0.9, 0.93, 0.94, 0.95, 0.96, 0.95, 0.97, 0.98, 0.99, 0.98]),
    BLU: seriLampau(52_300_000_000, [0.55, 0.7, 0.8, 0.83, 0.82, 0.88, 0.9, 0.92, 0.94, 0.95, 1.0, 1.05]),
  },
};
export const TAHUN_BULANAN = Object.keys(SERI_BULANAN).map(Number).sort((a, b) => b - a);

/* =========================================================
   Rincian bulanan per jenis belanja & sumber dana (TA berjalan)
   Dipakai kartu target. Total tiap bulan = total bulanan dana tsb,
   total tiap jenis = pagu / realisasi di PAGU_JENIS — keduanya tepat tanpa sisa.
   ========================================================= */

const JENIS: JenisBelanja[] = ["Pegawai", "Barang", "Modal"];

/**
 * Membagi total per bulan ke tiga jenis belanja (iterative proportional fitting),
 * berangkat dari pola awal (bibit) per jenis, lalu dibulatkan ke ribuan rupiah.
 */
function bagiPerJenis(totalBulan: number[], totalJenis: Record<JenisBelanja, number>, bibit: Record<JenisBelanja, number[]>) {
  const n = totalBulan.length;
  let m = JENIS.map((j) => bibit[j].slice(0, n));
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < n; i++) {
      const s = m.reduce((a, row) => a + row[i], 0);
      m = m.map((row) => row.map((v, k) => (k === i && s ? (v * totalBulan[i]) / s : v)));
    }
    m = m.map((row, k) => {
      const s = jumlah(row);
      return row.map((v) => (s ? (v * totalJenis[JENIS[k]]) / s : 0));
    });
  }
  const pegawai = m[0].map((v) => Math.round(v / 1e3) * 1e3);
  const modal = m[2].map((v) => Math.round(v / 1e3) * 1e3);
  pegawai[n - 1] += totalJenis.Pegawai - jumlah(pegawai);
  modal[n - 1] += totalJenis.Modal - jumlah(modal);
  const barang = totalBulan.map((t, i) => t - pegawai[i] - modal[i]);
  return { Pegawai: pegawai, Barang: barang, Modal: modal } as Record<JenisBelanja, number[]>;
}

/** Pola awal: pegawai rata tiap bulan, barang naik di akhir tahun, modal menumpuk di semester II */
const BIBIT_TARGET: Record<JenisBelanja, number[]> = {
  Pegawai: Array(12).fill(1),
  Barang: [0.6, 0.8, 1, 1, 0.9, 1, 1.1, 1, 1, 1, 1.1, 1.6],
  Modal: [0.05, 0.1, 0.3, 0.5, 0.6, 0.9, 1.1, 1.2, 1.3, 1.3, 1.6, 2.4],
};
const BIBIT_REALISASI: Record<JenisBelanja, number[]> = {
  Pegawai: Array(12).fill(1),
  Barang: [0.5, 0.8, 1, 1, 0.9, 1, 1.1, 1, 1, 0.9, 1, 1],
  Modal: [0.01, 0.04, 0.15, 0.3, 0.45, 0.6, 0.9, 1, 1.1, 0.8, 1, 1],
};

const totalPerJenis = (d: Dana, kunci: "pagu" | "realisasi") =>
  Object.fromEntries(JENIS.map((j) => [j, PAGU_JENIS[d][j][kunci]])) as Record<JenisBelanja, number>;

export const RINCIAN_BULANAN: Record<Dana, { target: Record<JenisBelanja, number[]>; realisasi: Record<JenisBelanja, number[]> }> = {
  RM: {
    target: bagiPerJenis(RENCANA_2026.RM, totalPerJenis("RM", "pagu"), BIBIT_TARGET),
    realisasi: bagiPerJenis(REALISASI_BULANAN.RM, totalPerJenis("RM", "realisasi"), BIBIT_REALISASI),
  },
  BLU: {
    target: bagiPerJenis(RENCANA_2026.BLU, totalPerJenis("BLU", "pagu"), BIBIT_TARGET),
    realisasi: bagiPerJenis(REALISASI_BULANAN.BLU, totalPerJenis("BLU", "realisasi"), BIBIT_REALISASI),
  },
};

export interface KartuTarget {
  kode: string;
  nama: string;
  jenis: JenisBelanja;
  dana: Dana[];
}

export const KARTU_TARGET: KartuTarget[] = [
  { kode: "pegawai-rm", nama: "Belanja Pegawai", jenis: "Pegawai", dana: ["RM"] },
  { kode: "barang-rm", nama: "Belanja Barang", jenis: "Barang", dana: ["RM"] },
  { kode: "barang-blu", nama: "Belanja Barang", jenis: "Barang", dana: ["BLU"] },
  { kode: "modal-rm", nama: "Belanja Modal", jenis: "Modal", dana: ["RM"] },
  { kode: "modal-blu", nama: "Belanja Modal", jenis: "Modal", dana: ["BLU"] },
];

/** Angka kartu target untuk bulan terpilih (1–12) */
export function hitungKartuTarget(k: KartuTarget, bulan: number) {
  const i = bulan - 1;
  const t = (d: Dana) => RINCIAN_BULANAN[d].target[k.jenis];
  const r = (d: Dana) => RINCIAN_BULANAN[d].realisasi[k.jenis];
  const adaRealisasi = i < REALISASI_BULANAN[k.dana[0]].length;
  return {
    pagu: jumlah(k.dana.map((d) => PAGU_JENIS[d][k.jenis].pagu)),
    targetBulan: jumlah(k.dana.map((d) => t(d)[i])),
    realisasiBulan: adaRealisasi ? jumlah(k.dana.map((d) => r(d)[i])) : null,
    targetSd: jumlah(k.dana.map((d) => jumlah(t(d).slice(0, bulan)))),
    realisasiSd: jumlah(k.dana.map((d) => jumlah(r(d).slice(0, bulan)))),
  };
}

/** Data tahunan sebelum 2024 (hanya total setahun) */
const TAHUNAN_LAMA: Record<number, Record<Dana, { pagu: number; realisasi: number }>> = {
  2022: { RM: { pagu: 24_600_000_000, realisasi: 23_105_400_000 }, BLU: { pagu: 44_200_000_000, realisasi: 40_318_750_000 } },
  2023: { RM: { pagu: 26_100_000_000, realisasi: 24_912_300_000 }, BLU: { pagu: 48_700_000_000, realisasi: 45_604_900_000 } },
};

const danaFilter = (f: FilterDana): Dana[] => (f === "Gabung" ? ["RM", "BLU"] : [f]);

/** Seri bulanan untuk satu tahun & filter dana */
export function seriBulananTahun(tahun: number, f: FilterDana) {
  const d = danaFilter(f).map((x) => SERI_BULANAN[tahun][x]);
  const nReal = Math.max(...d.map((s) => s.realisasi.length));
  return {
    pagu: jumlah(d.map((s) => s.pagu)),
    target: BULAN_12.map((_, i) => jumlah(d.map((s) => s.rencana[i]))),
    realisasi: BULAN_12.map((_, i) => (i < nReal ? jumlah(d.map((s) => s.realisasi[i] ?? 0)) : null)),
    /** jumlah bulan yang sudah tutup buku */
    bulanTutup: tahun === TAHUN_BERJALAN ? BULAN_BERJALAN - 1 : 12,
  };
}

/** Seri tahunan 2022 s.d. tahun berjalan */
export function seriTahunan(f: FilterDana) {
  const tahun = [...Object.keys(TAHUNAN_LAMA).map(Number), ...TAHUN_BULANAN.slice().reverse()];
  const baris = tahun.map((t) => {
    const ds = danaFilter(f);
    if (TAHUNAN_LAMA[t]) {
      return { tahun: t, target: jumlah(ds.map((x) => TAHUNAN_LAMA[t][x].pagu)), realisasi: jumlah(ds.map((x) => TAHUNAN_LAMA[t][x].realisasi)) };
    }
    const s = seriBulananTahun(t, f);
    return { tahun: t, target: s.pagu, realisasi: jumlah(s.realisasi.map((r) => r ?? 0)) };
  });
  return baris;
}

/** "Barang (BLU)", "Pegawai (RM)", … dari kode akun */
export function labelJenisAkun(akun: string): string {
  const jenis = jenisBelanjaDariAkun(akun) ?? "Lainnya";
  return `${jenis} (${akun.startsWith("525") || akun.startsWith("537") ? "BLU" : "RM"})`;
}

/** Lima jenis dokumen belanja beserta warna badge, ikon, dan contoh nomornya */
export const JENIS_DOKUMEN: {
  value: JenisDokumen;
  info: string;
  tone: "g" | "w" | "b" | "i" | "p" | "";
  ikon: "receipt" | "contract" | "cap" | "wallet" | "plane";
  contohNo: string;
}[] = [
  { value: "Kwitansi", info: "belanja langsung", tone: "w", ikon: "receipt", contohNo: "0420/KWT/BLU/X/2026" },
  { value: "Kontrak", info: "SPK / kontrak", tone: "i", ikon: "contract", contohNo: "014/KTR/PPK-BLU/X/2026" },
  { value: "Honorarium", info: "honor narasumber / panitia", tone: "g", ikon: "cap", contohNo: "0115/HON/RM/X/2026" },
  { value: "Gaji", info: "gaji, tunjangan, uang makan, lembur", tone: "", ikon: "wallet", contohNo: "0232/GJ/RM/X/2026" },
  { value: "Perjadin", info: "perjalanan dinas (SPD)", tone: "p", ikon: "plane", contohNo: "0416/SPD/BLU/X/2026" },
];

export const infoJenisDokumen = (j: JenisDokumen) => JENIS_DOKUMEN.find((x) => x.value === j) ?? JENIS_DOKUMEN[0];

export const PERAN: Peran[] = ["Administrator", "Operator Pengadaan", "Operator Pencairan", "Operator Pengesahan", "Pejabat Pengadaan", "PPK", "Manajemen"];

/** Peran yang hanya boleh dipegang SATU akun aktif (database juga menolak akun aktif kedua) */
export const PERAN_SATU_AKUN: Peran[] = ["Operator Pencairan", "Operator Pengesahan"];

/** Urutan status dokumen belanja: dicatat pengadaan → dicairkan → disahkan */
export const STATUS_BELANJA: StatusBelanja[] = ["Belum dicairkan", "Dicairkan", "Disahkan"];

/** Mekanisme pembayaran pada rekap pencairan */
export const JENIS_PENCAIRAN: { value: JenisPencairan; label: string }[] = [
  { value: "LS", label: "LS — Langsung ke penyedia" },
  { value: "GU", label: "GU — Ganti Uang" },
  { value: "TUP", label: "TUP — Tambahan UP" },
];

/* ---------- Riwayat aktivitas (jejak audit) ---------- */

export const JENIS_AKTIVITAS: { value: JenisAktivitas; label: string; tone: "g" | "w" | "b" | "i" | "m" | "" }[] = [
  { value: "Buat", label: "Buat", tone: "g" },
  { value: "Ubah", label: "Ubah", tone: "w" },
  { value: "Hapus", label: "Hapus", tone: "b" },
  { value: "Cetak", label: "Cetak", tone: "m" },
  { value: "Status", label: "Status dokumen", tone: "i" },
  { value: "Pencairan", label: "Pencairan", tone: "i" },
  { value: "Pengesahan", label: "Pengesahan", tone: "g" },
  { value: "Pengguna", label: "Pengguna", tone: "" },
  { value: "Referensi", label: "Referensi", tone: "" },
  { value: "Sesi", label: "Masuk / keluar", tone: "m" },
];

export const MODUL_AKTIVITAS: ModulAktivitas[] = ["Pengadaan", "Belanja", "Pencairan", "Pengesahan", "Pengguna", "Referensi", "Sistem"];

