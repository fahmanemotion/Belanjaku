/**
 * DATA CONTOH (dummy).
 * Seluruh angka di sini hanya untuk prototipe tampilan.
 * Saat integrasi Supabase, ganti sumber data ini dengan query ke tabel masing-masing.
 */
import { rupiah } from "./format";
import { AKUN_DIPA, akunDariMak } from "./mak";
import type {
  Aktivitas,
  JenisAktivitas,
  JenisDokumen,
  Kegiatan,
  ModulAktivitas,
  Pengguna,
  Peran,
  Referensi,
  Sp3bBlu,
  StatusBelanja,
} from "./types";

export const TAHUN_ANGGARAN = 2026;
export const KODE_DIPA = "DIPA 022.12.4.287494";

/* ---------- Sumber dana & jenis belanja ---------- */

export type Dana = "RM" | "BLU";
export type FilterDana = "Gabung" | Dana;
export type JenisBelanja = "Pegawai" | "Barang" | "Modal";

export const FILTER_DANA: FilterDana[] = ["Gabung", "RM", "BLU"];

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

/**
 * Ringkasan kartu sumber dana.
 * - BLU: pengesahan = belanja yang sudah disahkan lewat SP3B BLU (dihitung dari modul Pengesahan),
 *        pencairan = realisasi yang sudah cair tetapi belum disahkan.
 * - RM : pengesahan = pertanggungjawaban UP lewat SPM GU Nihil,
 *        pencairan = SP2D LS/UP/GU/TUP.
 */
export const RINGKASAN_DANA: Record<Dana, { nama: string; kegiatan: number; kegiatanSelesai: number; pengesahanRM?: number }> = {
  BLU: { nama: "PNBP BLU", kegiatan: 48, kegiatanSelesai: 29 },
  RM: { nama: "Rupiah Murni", kegiatan: 17, kegiatanSelesai: 11, pengesahanRM: 1_845_300_000 },
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

/** Lima jenis dokumen pengajuan beserta warna badge, ikon, dan contoh nomornya */
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

export const REFERENSI_AWAL: Referensi = {
  // Daftar akun mengikuti DIPA (lib/mak.ts)
  akun: Object.entries(AKUN_DIPA).map(([kode, uraian]) => ({ kode, uraian, jenis: labelJenisAkun(kode) })),
  unit: [
    { kode: "UK01", nama: "Bagian Administrasi Umum dan Keuangan", penanggungJawab: "Kabag AUK" },
    { kode: "UK02", nama: "Bagian Administrasi Akademik dan Ketarunaan", penanggungJawab: "Kabag AAK" },
    { kode: "UK03", nama: "Program Studi Nautika", penanggungJawab: "Ketua Prodi" },
    { kode: "UK04", nama: "Program Studi Teknika", penanggungJawab: "Ketua Prodi" },
    { kode: "UK05", nama: "Program Studi KALK", penanggungJawab: "Ketua Prodi" },
    { kode: "UK06", nama: "Unit Diklat Keterampilan Khusus", penanggungJawab: "Kepala Unit" },
    { kode: "UK07", nama: "Unit Laboratorium dan Simulator", penanggungJawab: "Kepala Unit" },
    { kode: "UK08", nama: "Unit Penjaminan Mutu", penanggungJawab: "Kepala Unit" },
  ],
  penyedia: [
    { nama: "CV Bahari Mandiri", bidang: "Alat tulis & bahan habis pakai", kota: "Makassar", aktif: true },
    { nama: "PT Navigasi Teknik Nusantara", bidang: "Pemeliharaan simulator", kota: "Jakarta", aktif: true },
    { nama: "PT Sulawesi Tour", bidang: "Tiket perjalanan dinas", kota: "Makassar", aktif: true },
    { nama: "CV Karya Lestari", bidang: "Konsumsi kegiatan", kota: "Gowa", aktif: true },
    { nama: "PT Cipta Daya Elektrik", bidang: "Instalasi listrik", kota: "Makassar", aktif: true },
    { nama: "CV Samudra Safety Indonesia", bidang: "Alat keselamatan pelayaran", kota: "Surabaya", aktif: true },
    { nama: "CV Grafika Losari", bidang: "Percetakan", kota: "Makassar", aktif: true },
    { nama: "PT Sinar Bersih Celebes", bidang: "Jasa kebersihan", kota: "Makassar", aktif: true },
    { nama: "PT PLN (Persero) UP3 Makassar Selatan", bidang: "Listrik", kota: "Makassar", aktif: true },
    { nama: "Narasumber perorangan", bidang: "Honor narasumber", kota: "—", aktif: true },
    { nama: "Daftar nominatif pegawai", bidang: "Pembayaran hak pegawai", kota: "—", aktif: true },
    { nama: "PT Laut Biru Teknik", bidang: "Suku cadang mesin kapal", kota: "Jakarta", aktif: false },
  ],
  dana: [
    { kode: "RM", nama: "Rupiah Murni", warna: "#141416" },
    { kode: "BLU", nama: "PNBP BLU", warna: "#f05a1a" },
    { kode: "HBH", nama: "Hibah", warna: "#9b9ba4" },
  ],
};

/* ---------- Kegiatan (satu daftar untuk modul Belanja, Pencairan, Pengesahan & Dashboard) ---------- */

const KEGIATAN_DASAR: Omit<Kegiatan, "dibuatOleh" | "akun">[] = [
  { id: "BLJ-2026-0416", uraian: "Uang makan PNS — September", noDokumen: "0231/GJ/RM/X/2026", jenisDokumen: "Gaji", penyedia: "Daftar nominatif pegawai", dana: "RM", mak: "4627.EBA.994.001.A.511129", unit: "UK01", nilai: 42_350_000, tanggal: "2026-10-06", status: "Disetujui", spp: { no: "00292/SPP-LS/2026", jenis: "LS", tahap: 3, tanggal: "2026-10-13" } },
  { id: "BLJ-2026-0415", uraian: "Uang lembur pegawai Bagian AUK — September", noDokumen: "0228/GJ/RM/X/2026", jenisDokumen: "Gaji", penyedia: "Daftar nominatif pegawai", dana: "RM", mak: "4627.EBA.994.001.A.512211", unit: "UK01", nilai: 18_600_000, tanggal: "2026-10-04", status: "Disetujui", spp: { no: "00280/SPP-LS/2026", jenis: "LS", tahap: 4, tanggal: "2026-10-08" } },
  { id: "BLJ-2026-0414", uraian: "Pemeliharaan simulator ECDIS & radar", noDokumen: "012/KTR/PPK-BLU/X/2026", jenisDokumen: "Kontrak", penyedia: "PT Navigasi Teknik Nusantara", dana: "BLU", mak: "3996.CCA.002.054.A.525114", unit: "UK07", nilai: 186_500_000, tanggal: "2026-10-15", status: "Disetujui", spp: { no: "00290/SPP-LS/2026", jenis: "LS", tahap: 1, tanggal: "2026-10-16" } },
  { id: "BLJ-2026-0413", uraian: "Instalasi listrik gedung simulator", noDokumen: "011/KTR/PPK-BLU/IX/2026", jenisDokumen: "Kontrak", penyedia: "PT Cipta Daya Elektrik", dana: "BLU", mak: "1975.EBB.951.053.A.537113", unit: "UK07", nilai: 312_400_000, tanggal: "2026-10-12", status: "Disetujui", spp: { no: "00289/SPP-LS/2026", jenis: "LS", tahap: 2, tanggal: "2026-10-14" } },
  { id: "BLJ-2026-0412", uraian: "Perjalanan dinas rapat koordinasi diklat ke Jakarta", noDokumen: "0415/SPD/BLU/X/2026", jenisDokumen: "Perjadin", penyedia: "PT Sulawesi Tour", dana: "BLU", mak: "4627.EBA.962.052.A.525115", unit: "UK06", nilai: 24_750_000, tanggal: "2026-10-10", status: "Disetujui", spp: { no: "00288/SPP-LS/2026", jenis: "LS", tahap: 3, tanggal: "2026-10-12" } },
  { id: "BLJ-2026-0411", uraian: "Konsumsi ujian keahlian pelaut ANT-III", noDokumen: "0418/KWT/BLU/X/2026", jenisDokumen: "Kwitansi", penyedia: "CV Karya Lestari", dana: "BLU", mak: "3996.DCB.011.601.A.525112", unit: "UK06", nilai: 38_400_000, tanggal: "2026-10-09", status: "Disetujui", spp: { no: "00287/SPP-LS/2026", jenis: "LS", tahap: 4, tanggal: "2026-10-11" } },
  { id: "BLJ-2026-0410", uraian: "Cetak modul diklat Basic Safety Training", noDokumen: "0402/KWT/BLU/X/2026", jenisDokumen: "Kwitansi", penyedia: "CV Grafika Losari", dana: "BLU", mak: "3996.DCB.011.051.A.525112", unit: "UK06", nilai: 18_250_000, tanggal: "2026-10-08", status: "Disetujui", spp: { no: "00286/SPP-LS/2026", jenis: "LS", tahap: 4, tanggal: "2026-10-10" } },
  { id: "BLJ-2026-0409", uraian: "Langganan daya listrik gedung asrama", noDokumen: "0407/KWT/BLU/X/2026", jenisDokumen: "Kwitansi", penyedia: "PT PLN (Persero) UP3 Makassar Selatan", dana: "BLU", mak: "4627.EBA.994.002.B.525112", unit: "UK01", nilai: 61_200_000, tanggal: "2026-10-07", status: "Disetujui", spp: { no: "00285/SPP-LS/2026", jenis: "LS", tahap: 4, tanggal: "2026-10-09" } },
  { id: "BLJ-2026-0408", uraian: "Bahan praktik mesin Diklat Kecakapan Kapal Tradisional", noDokumen: "027/SPK/PPK-RM/X/2026", jenisDokumen: "Kontrak", penyedia: "CV Bahari Mandiri", dana: "RM", mak: "3996.SCB.005.059.A.521211", unit: "UK04", nilai: 47_800_000, tanggal: "2026-10-05", status: "Disetujui", spp: { no: "00284/SPP-LS/2026", jenis: "LS", tahap: 4, tanggal: "2026-10-07" } },
  { id: "BLJ-2026-0407", uraian: "Konsumsi rapat koordinasi kerja triwulan IV", noDokumen: "0409/KWT/BLU/X/2026", jenisDokumen: "Kwitansi", penyedia: "CV Karya Lestari", dana: "BLU", mak: "4627.EBA.962.052.A.525112", unit: "UK01", nilai: 22_150_000, tanggal: "2026-10-03", status: "Disetujui", spp: { no: "00283/SPP-LS/2026", jenis: "LS", tahap: 4, tanggal: "2026-10-06" } },
  { id: "BLJ-2026-0406", uraian: "Konsumsi & perlengkapan Diksar Taruna angkatan 2026", noDokumen: "010/KTR/PPK-BLU/IX/2026", jenisDokumen: "Kontrak", penyedia: "CV Karya Lestari", dana: "BLU", mak: "1975.DAB.002.601.C.525112", unit: "UK02", nilai: 350_000_000, tanggal: "2026-09-29", status: "Disetujui", spp: { no: "00282/SPP-TUP/2026", jenis: "TUP", tahap: 4, tanggal: "2026-10-02" } },
  { id: "BLJ-2026-0405", uraian: "Jasa cleaning service gedung asrama — Oktober", noDokumen: "009/KTR/PPK-BLU/I/2026", jenisDokumen: "Kontrak", penyedia: "PT Sinar Bersih Celebes", dana: "BLU", mak: "4627.EBA.962.052.C.525113", unit: "UK01", nilai: 34_900_000, tanggal: "2026-09-30", status: "Disetujui", spp: { no: "00281/SPP-LS/2026", jenis: "LS", tahap: 4, tanggal: "2026-10-01" } },
  { id: "BLJ-2026-0404", uraian: "Pengadaan life jacket & ring buoy dukungan Sekolah Rakyat", noDokumen: "026/SPK/PPK-RM/X/2026", jenisDokumen: "Kontrak", penyedia: "CV Samudra Safety Indonesia", dana: "RM", mak: "3996.DCB.018.052.B.521211", unit: "UK03", nilai: 64_900_000, tanggal: "2026-10-14", status: "Disetujui" },
  { id: "BLJ-2026-0403", uraian: "Pengadaan kursi lab bahasa", noDokumen: "013/SPK/PPK-BLU/X/2026", jenisDokumen: "Kontrak", penyedia: "CV Bahari Mandiri", dana: "BLU", mak: "1975.EBB.951.053.A.537112", unit: "UK02", nilai: 92_300_000, tanggal: "2026-10-16", status: "Diverifikasi" },
  { id: "BLJ-2026-0402", uraian: "Sewa bus kegiatan kuliah umum taruna", noDokumen: "0221/KWT/RM/X/2026", jenisDokumen: "Kwitansi", penyedia: "PT Sulawesi Tour", dana: "RM", mak: "3996.SAB.004.601.D.521219", unit: "UK03", nilai: 12_000_000, tanggal: "2026-10-17", status: "Diajukan" },
  { id: "BLJ-2026-0401", uraian: "Honor narasumber pengabdian masyarakat Sekolah Rakyat", noDokumen: "0211/HON/RM/X/2026", jenisDokumen: "Honorarium", penyedia: "Narasumber perorangan", dana: "RM", mak: "3996.DCB.018.052.B.521213", unit: "UK08", nilai: 15_600_000, tanggal: "2026-10-17", status: "Draf" },
  { id: "BLJ-2026-0400", uraian: "Konsumsi rapat Dewan Pengawas", noDokumen: "0398/KWT/BLU/X/2026", jenisDokumen: "Kwitansi", penyedia: "CV Karya Lestari", dana: "BLU", mak: "4627.EBD.953.051.L.525112", unit: "UK01", nilai: 9_600_000, tanggal: "2026-10-04", status: "Ditolak" },
];

/** Operator pembuat tiap pengajuan contoh (menurut unit kerja); unit lain dibuat oleh u1 */
const PEMBUAT_PER_UNIT: Record<string, string> = { UK03: "u5", UK04: "u6", UK06: "u7" };

export const KEGIATAN_AWAL: Kegiatan[] = KEGIATAN_DASAR.map((k) => ({
  ...k,
  akun: akunDariMak(k.mak),
  dibuatOleh: PEMBUAT_PER_UNIT[k.unit] ?? "u1",
}));

/* ---------- Pengesahan (SP3B BLU) ---------- */

/** Periode pengesahan yang sedang berjalan */
export const PERIODE_BERJALAN = { nomor: "SP3B-BLU-10/2026", periode: "Oktober 2026", bulan: "2026-10" };

/** Sebagian SPJ September yang belum disahkan (masih outstanding) */
const OUTSTANDING_SEPTEMBER = 352_500_000;

/**
 * Riwayat pengesahan Januari–September (terbaru di atas).
 * Pencairan tiap bulan = realisasi belanja BLU bulan tersebut.
 * Periode Oktober dihitung langsung dari dokumen di modul Pencairan.
 */
export const PENGESAHAN_AWAL: Sp3bBlu[] = REALISASI_BULANAN.BLU.slice(0, BULAN_BERJALAN - 1)
  .map((nilai, i) => ({
    nomor: `SP3B-BLU-${String(i + 1).padStart(2, "0")}/2026`,
    periode: `${NAMA_BULAN[i]} 2026`,
    pencairan: nilai,
    pengesahan: i === BULAN_BERJALAN - 2 ? nilai - OUTSTANDING_SEPTEMBER : nilai,
  }))
  .reverse();

export const PERAN: Peran[] = ["Administrator", "PPK", "PPSPM", "Bendahara Pengeluaran", "Operator Unit"];

export const PENGGUNA_AWAL: Pengguna[] = [
  { id: "u1", nama: "Fahman", email: "perencanaan@pipmakassar.ac.id", peran: "Administrator", unit: "UK01", aktif: true },
  { id: "u2", nama: "Andi Rahmawati", email: "ppk@pipmakassar.ac.id", peran: "PPK", unit: "UK01", aktif: true },
  { id: "u3", nama: "Muh. Syahrir", email: "ppspm@pipmakassar.ac.id", peran: "PPSPM", unit: "UK01", aktif: true },
  { id: "u4", nama: "Nurul Hikmah", email: "bendahara.blu@pipmakassar.ac.id", peran: "Bendahara Pengeluaran", unit: "UK01", aktif: true },
  { id: "u5", nama: "Capt. Rudy Hartono", email: "nautika@pipmakassar.ac.id", peran: "Operator Unit", unit: "UK03", aktif: true },
  { id: "u6", nama: "Ir. Baharuddin", email: "teknika@pipmakassar.ac.id", peran: "Operator Unit", unit: "UK04", aktif: true },
  { id: "u7", nama: "Sri Wahyuni", email: "diklat@pipmakassar.ac.id", peran: "Operator Unit", unit: "UK06", aktif: false },
];

export const STATUS_BELANJA: StatusBelanja[] = ["Draf", "Diajukan", "Diverifikasi", "Disetujui", "Ditolak"];

export const NAMA_TAHAP = ["", "SPP", "Verifikasi", "SPM", "SP2D"] as const;

/* ---------- Riwayat aktivitas (jejak audit) ---------- */

export const JENIS_AKTIVITAS: { value: JenisAktivitas; label: string; tone: "g" | "w" | "b" | "i" | "m" | "" }[] = [
  { value: "Buat", label: "Buat", tone: "g" },
  { value: "Ubah", label: "Ubah", tone: "w" },
  { value: "Hapus", label: "Hapus", tone: "b" },
  { value: "Cetak", label: "Cetak", tone: "m" },
  { value: "Status", label: "Status pengajuan", tone: "i" },
  { value: "Pencairan", label: "Pencairan", tone: "i" },
  { value: "Pengesahan", label: "Pengesahan", tone: "g" },
  { value: "Pengguna", label: "Pengguna", tone: "" },
  { value: "Referensi", label: "Referensi", tone: "" },
  { value: "Sesi", label: "Masuk / keluar", tone: "m" },
];

export const MODUL_AKTIVITAS: ModulAktivitas[] = ["Belanja", "Pencairan", "Pengesahan", "Pengguna", "Referensi", "Sistem"];

/** Kalimat aksi saat status pengajuan berubah */
export const AKSI_STATUS: Record<StatusBelanja, string> = {
  Draf: "mengembalikan ke draf",
  Diajukan: "mengajukan untuk diverifikasi",
  Diverifikasi: "memverifikasi pagu pengajuan",
  Disetujui: "menyetujui pengajuan",
  Ditolak: "mengembalikan pengajuan ke unit",
};

/** Kalimat aksi & pelaku contoh tiap tahap pencairan */
export const AKSI_TAHAP: Record<number, { aksi: string; oleh: string }> = {
  2: { aksi: "memverifikasi SPP", oleh: "u3" },
  3: { aksi: "menerbitkan SPM", oleh: "u3" },
  4: { aksi: "mencatat SP2D terbit", oleh: "u4" },
};

const tambahHari = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const pukul = (tgl: string, j: number, mnt: number) => `${tgl}T${String(j).padStart(2, "0")}:${String(mnt).padStart(2, "0")}:00`;

/** Nilai saat dibuat untuk dokumen yang kemudian diubah (agar jejaknya konsisten) */
const NILAI_SAAT_DIBUAT: Record<string, number> = { "BLJ-2026-0402": 13_500_000 };

/** Riwayat contoh disusun dari data kegiatan, ditambah beberapa kejadian khusus (ubah, hapus, cetak) */
function susunAktivitasAwal(): Aktivitas[] {
  const log: Omit<Aktivitas, "id">[] = [];
  KEGIATAN_AWAL.forEach((k, i) => {
    const m = (i * 7) % 40;
    const obj = { objekId: k.id, objekLabel: k.uraian, modul: "Belanja" as const };
    log.push({
      ...obj,
      waktu: pukul(k.tanggal, 8, m + 5),
      oleh: k.dibuatOleh,
      jenis: "Buat",
      aksi: "membuat pengajuan",
      catatan: `${k.jenisDokumen} · ${rupiah(NILAI_SAAT_DIBUAT[k.id] ?? k.nilai)} · MAK ${k.mak}`,
    });
    if (k.status === "Draf") return;
    log.push({ ...obj, waktu: pukul(k.tanggal, 9, m + 10), oleh: k.dibuatOleh, jenis: "Status", aksi: AKSI_STATUS.Diajukan, perubahan: [{ kolom: "Status", dari: "Draf", ke: "Diajukan" }] });
    if (k.status === "Diajukan") return;
    log.push({ ...obj, waktu: pukul(k.tanggal, 13, m + 3), oleh: "u1", jenis: "Status", aksi: AKSI_STATUS.Diverifikasi, perubahan: [{ kolom: "Status", dari: "Diajukan", ke: "Diverifikasi" }] });
    if (k.status === "Ditolak") {
      log.push({ ...obj, waktu: pukul(k.tanggal, 15, m + 12), oleh: "u2", jenis: "Status", aksi: AKSI_STATUS.Ditolak, perubahan: [{ kolom: "Status", dari: "Diverifikasi", ke: "Ditolak" }], catatan: "Nilai konsumsi melebihi standar biaya masukan, mohon disesuaikan" });
      return;
    }
    if (k.status !== "Disetujui") return;
    log.push({ ...obj, waktu: pukul(k.tanggal, 15, m + 12), oleh: "u2", jenis: "Status", aksi: AKSI_STATUS.Disetujui, perubahan: [{ kolom: "Status", dari: "Diverifikasi", ke: "Disetujui" }] });
    if (!k.spp) return;
    const sp = { ...obj, modul: "Pencairan" as const, jenis: "Pencairan" as const };
    log.push({ ...sp, waktu: pukul(k.spp.tanggal, 10, m + 8), oleh: "u2", aksi: `membuat SPP-${k.spp.jenis}`, catatan: `No. ${k.spp.no}` });
    for (let t = 2; t <= k.spp.tahap; t++) {
      log.push({ ...sp, waktu: pukul(tambahHari(k.spp.tanggal, t - 1), 9 + t, m + 4), oleh: AKSI_TAHAP[t].oleh, aksi: AKSI_TAHAP[t].aksi, perubahan: [{ kolom: "Tahap", dari: NAMA_TAHAP[t - 1], ke: NAMA_TAHAP[t] }] });
    }
  });

  // Kejadian khusus untuk contoh penelusuran
  log.push(
    { waktu: "2026-10-17T08:52:00", oleh: "u5", jenis: "Ubah", modul: "Belanja", aksi: "mengubah pengajuan", objekId: "BLJ-2026-0402", objekLabel: "Sewa bus kegiatan kuliah umum taruna", perubahan: [{ kolom: "Nilai", dari: rupiah(13_500_000), ke: rupiah(12_000_000) }], catatan: "Penyesuaian harga sesuai penawaran akhir penyedia" },
    { waktu: "2026-10-16T08:51:00", oleh: "u1", jenis: "Ubah", modul: "Belanja", aksi: "mengubah pengajuan", objekId: "BLJ-2026-0403", objekLabel: "Pengadaan kursi lab bahasa", perubahan: [{ kolom: "No. dokumen", dari: "013/SPK/PPK-BLU/IX/2026", ke: "013/SPK/PPK-BLU/X/2026" }], catatan: "Bulan pada nomor SPK salah ketik" },
    { waktu: "2026-10-05T08:12:00", oleh: "u6", jenis: "Buat", modul: "Belanja", aksi: "membuat pengajuan", objekId: "BLJ-2026-0399", objekLabel: "Bahan praktik mesin Diklat Kecakapan Kapal Tradisional", catatan: `Kontrak · ${rupiah(47_800_000)} · MAK 3996.SCB.005.059.A.521211` },
    { waktu: "2026-10-05T09:14:00", oleh: "u6", jenis: "Hapus", modul: "Belanja", aksi: "menghapus pengajuan", objekId: "BLJ-2026-0399", objekLabel: "Bahan praktik mesin Diklat Kecakapan Kapal Tradisional", catatan: "Terinput dua kali, dokumen yang dipakai BLJ-2026-0408" },
    { waktu: "2026-10-15T16:10:00", oleh: "u1", jenis: "Cetak", modul: "Belanja", aksi: "mencetak lembar pengajuan", objekId: "BLJ-2026-0414", objekLabel: "Pemeliharaan simulator ECDIS & radar" },
    { waktu: "2026-09-29T16:20:00", oleh: "u2", jenis: "Cetak", modul: "Belanja", aksi: "mencetak lembar pengajuan", objekId: "BLJ-2026-0406", objekLabel: "Konsumsi & perlengkapan Diksar Taruna angkatan 2026" },
    { waktu: "2026-10-01T10:15:00", oleh: "u1", jenis: "Pengguna", modul: "Pengguna", aksi: "menonaktifkan pengguna", objekId: "u7", objekLabel: "Sri Wahyuni", perubahan: [{ kolom: "Status", dari: "Aktif", ke: "Nonaktif" }] },
  );

  return log
    .sort((a, b) => a.waktu.localeCompare(b.waktu))
    .map((a, i) => ({ ...a, id: `A${String(i + 1).padStart(5, "0")}` }))
    .reverse();
}

/** Terbaru di atas */
export const AKTIVITAS_AWAL: Aktivitas[] = susunAktivitasAwal();
