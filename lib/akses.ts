/**
 * HAK AKSES PER PERAN (otorisasi)
 * --------------------------------
 * Satu-satunya tempat untuk mengatur siapa boleh membuka modul apa dan melakukan aksi apa.
 * Ubah tabel AKSES di bawah bila pembagian tugas di PIP Makassar berbeda.
 *
 * Alur dokumen & pelakunya:
 *   Operator Unit  : buat pengajuan → ajukan                       (Draf → Diajukan)
 *   Administrator  : verifikasi ketersediaan pagu MAK              (Diajukan → Diverifikasi)
 *   PPK            : setujui / tolak, lalu terbitkan SPP           (Diverifikasi → Disetujui → SPP)
 *   PPSPM          : uji SPP dan terbitkan SPM                     (SPP → Verifikasi → SPM)
 *   Bendahara      : catat SP2D terbit, sahkan belanja BLU (SP3B)  (SPM → SP2D → Disahkan)
 *
 * Login memakai Supabase Auth. Izin aksi yang SAMA juga tersimpan di database (tabel izin_peran)
 * dan diperiksa oleh Row Level Security serta fungsi RPC — tampilan hanya mengikuti.
 * Bila mengubah pembagian izin, ubah tabel izin_peran di database DAN tabel AKSES di bawah.
 */
import type { Peran } from "./types";

export type Modul = "dashboard" | "belanja" | "aktivitas" | "pencairan" | "pengesahan" | "referensi" | "pengguna";

export type Izin =
  /** buat pengajuan baru; ubah, hapus, dan ajukan pengajuan buatan sendiri */
  | "belanja.buat"
  /** Diajukan → Diverifikasi (cek pagu MAK) */
  | "belanja.verifikasi"
  /** Diverifikasi → Disetujui / Ditolak */
  | "belanja.setujui"
  /** melihat pengajuan semua unit (tanpa izin ini hanya unit sendiri) */
  | "belanja.lihatSemua"
  /** menerbitkan SPP dari pengajuan yang disetujui */
  | "pencairan.spp"
  /** menguji SPP & menerbitkan SPM (tahap 2 dan 3) */
  | "pencairan.ppspm"
  /** mencatat SP2D terbit (tahap 4) */
  | "pencairan.sp2d"
  /** mengesahkan belanja BLU pada SP3B periode berjalan */
  | "pengesahan.sahkan"
  /** menambah data referensi */
  | "referensi.kelola"
  /** menambah, mengubah, menonaktifkan, menghapus pengguna */
  | "pengguna.kelola"
  /** melihat seluruh riwayat aktivitas (tanpa izin ini: aktivitas sendiri & dokumen unitnya) */
  | "aktivitas.semua"
  /** mengunggah FA Detail SAKTI untuk memperbarui Kertas Kerja POK */
  | "pok.unggah";

interface AturanPeran {
  modul: Modul[];
  izin: Izin[];
  /** ringkasan tugas, tampil di halaman login */
  tugas: string;
}

export const AKSES: Record<Peran, AturanPeran> = {
  Administrator: {
    modul: ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi", "pengguna"],
    izin: ["belanja.buat", "belanja.verifikasi", "belanja.lihatSemua", "aktivitas.semua", "referensi.kelola", "pengguna.kelola", "pok.unggah"],
    tugas: "Kelola pengguna & referensi, verifikasi pagu, unggah FA Detail",
  },
  PPK: {
    modul: ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.setujui", "belanja.lihatSemua", "pencairan.spp", "aktivitas.semua"],
    tugas: "Setujui atau tolak pengajuan, terbitkan SPP",
  },
  PPSPM: {
    modul: ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "pencairan.ppspm", "aktivitas.semua"],
    tugas: "Uji SPP dan terbitkan SPM",
  },
  "Bendahara Pengeluaran": {
    modul: ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "pencairan.sp2d", "pengesahan.sahkan", "aktivitas.semua"],
    tugas: "Catat SP2D terbit, sahkan belanja BLU (SP3B)",
  },
  "Operator Unit": {
    modul: ["dashboard", "belanja", "aktivitas", "referensi"],
    izin: ["belanja.buat", "pok.unggah"],
    tugas: "Buat, ubah, dan ajukan pengajuan unitnya; unggah FA Detail",
  },
};

export const bolehModul = (peran: Peran, modul: Modul) => AKSES[peran]?.modul.includes(modul) ?? false;
export const bolehIzin = (peran: Peran, izin: Izin) => AKSES[peran]?.izin.includes(izin) ?? false;

/** Modul dari alamat halaman, mis. "/belanja" → "belanja" */
export function modulDariPath(path: string): Modul | null {
  const seg = path.split("/")[1] ?? "";
  const semua: Modul[] = ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi", "pengguna"];
  return (semua as string[]).includes(seg) ? (seg as Modul) : null;
}

/** Izin & pelaku yang dibutuhkan untuk memajukan pencairan ke tahap berikutnya */
export const TAHAP_PENCAIRAN: Record<2 | 3 | 4, { izin: Izin; pelaku: string }> = {
  2: { izin: "pencairan.ppspm", pelaku: "PPSPM" },
  3: { izin: "pencairan.ppspm", pelaku: "PPSPM" },
  4: { izin: "pencairan.sp2d", pelaku: "Bendahara" },
};
