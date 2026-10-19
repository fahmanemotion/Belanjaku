/**
 * HAK AKSES PER PERAN (otorisasi)
 * --------------------------------
 * Satu-satunya tempat untuk mengatur siapa boleh membuka modul apa dan melakukan aksi apa.
 * Ubah tabel AKSES di bawah bila pembagian tugas di PIP Makassar berbeda.
 *
 * Alur dokumen & pelakunya:
 *   Operator Pengadaan  : mencatat dokumen belanja untuk unit kerja mana pun            (→ Belum dicairkan)
 *   Operator Keuangan   : mencentang belanja di Daftar Pencairan → Cairkan             (→ Dicairkan)
 *   Operator Pengesahan : mencentang belanja yang sudah dicairkan → Sahkan             (→ Disahkan)
 *   Bendahara Pengeluaran: boleh mencairkan dan mengesahkan
 *   PPK, PPSPM          : memantau dokumen, pencairan, dan pengesahan
 *   Administrator       : kelola pengguna & referensi; boleh mencatat, mencairkan, dan mengesahkan
 *
 * Login memakai Supabase Auth. Izin aksi yang SAMA juga tersimpan di database (tabel izin_peran)
 * dan diperiksa oleh Row Level Security serta fungsi RPC — tampilan hanya mengikuti.
 * Bila mengubah pembagian izin, ubah tabel izin_peran di database DAN tabel AKSES di bawah.
 */
import type { Peran } from "./types";

export type Modul = "dashboard" | "belanja" | "aktivitas" | "pencairan" | "pengesahan" | "referensi" | "pengguna";

export type Izin =
  /** mencatat dokumen belanja baru; ubah & hapus dokumen catatan sendiri selama belum dicairkan */
  | "belanja.buat"
  /** melihat dokumen belanja semua unit (tanpa izin ini hanya unit sendiri) */
  | "belanja.lihatSemua"
  /** mencentang belanja lalu membuat / membatalkan rekap pencairan */
  | "pencairan.rekap"
  /** mencentang belanja yang sudah dicairkan lalu membuat / membatalkan rekap pengesahan */
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
    izin: [
      "belanja.buat",
      "belanja.lihatSemua",
      "pencairan.rekap",
      "pengesahan.sahkan",
      "aktivitas.semua",
      "referensi.kelola",
      "pengguna.kelola",
      "pok.unggah",
    ],
    tugas: "Kelola pengguna & referensi; boleh mencatat, mencairkan, dan mengesahkan",
  },
  "Operator Pengadaan": {
    modul: ["dashboard", "belanja", "aktivitas", "referensi"],
    izin: ["belanja.buat", "belanja.lihatSemua", "pok.unggah"],
    tugas: "Catat dokumen belanja kebutuhan unit kerja; unggah FA Detail",
  },
  "Operator Keuangan": {
    modul: ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "pencairan.rekap", "aktivitas.semua"],
    tugas: "Centang belanja lalu cairkan (bayar ke penyedia / pihak ketiga)",
  },
  "Operator Pengesahan": {
    modul: ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "pengesahan.sahkan", "aktivitas.semua"],
    tugas: "Centang belanja yang sudah dicairkan lalu sahkan",
  },
  "Bendahara Pengeluaran": {
    modul: ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "pencairan.rekap", "pengesahan.sahkan", "aktivitas.semua"],
    tugas: "Mencairkan dan mengesahkan belanja",
  },
  PPK: {
    modul: ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "aktivitas.semua"],
    tugas: "Pantau dokumen belanja, pencairan, dan pengesahan",
  },
  PPSPM: {
    modul: ["dashboard", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "aktivitas.semua"],
    tugas: "Pantau dokumen belanja, pencairan, dan pengesahan",
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
