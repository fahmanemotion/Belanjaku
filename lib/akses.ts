/**
 * HAK AKSES PER PERAN (otorisasi)
 * --------------------------------
 * Satu-satunya tempat untuk mengatur siapa boleh membuka modul apa dan melakukan aksi apa.
 * Ubah tabel AKSES di bawah bila pembagian tugas di PIP Makassar berbeda.
 *
 * Alur dokumen & pelakunya (pengguna hanya dibedakan menurut peran, tidak terikat unit kerja):
 *   PPK                 : Pengadaan — Nota Dinas & HPS, lalu Kwitansi, BAP & BAST     (→ Belum dicairkan) — boleh banyak akun
 *   Pejabat Pengadaan   : Pengadaan — Surat Pesanan ke penyedia & Nota Pembelian                          — boleh banyak akun
 *   Operator Pengadaan  : mencatat dokumen belanja untuk unit kerja mana pun   (→ Belum dicairkan) — boleh banyak akun
 *   Operator Pencairan  : mencentang belanja di Daftar Pencairan → Cairkan    (→ Dicairkan)       — satu akun aktif
 *   Operator Pengesahan : mencentang belanja yang sudah dicairkan → Sahkan    (→ Disahkan)        — satu akun aktif
 *   Manajemen           : memantau seluruh modul
 *   Administrator       : kelola pengguna & referensi; boleh menjalankan semua tahap
 *
 * Login memakai Supabase Auth. Izin aksi yang SAMA juga tersimpan di database (tabel izin_peran)
 * dan diperiksa oleh Row Level Security serta fungsi RPC — tampilan hanya mengikuti.
 * Bila mengubah pembagian izin, ubah tabel izin_peran di database DAN tabel AKSES di bawah.
 */
import type { Peran } from "./types";

export type Modul = "dashboard" | "pengadaan" | "belanja" | "aktivitas" | "pencairan" | "pengesahan" | "referensi" | "pengguna";

export type Izin =
  /** mencatat dokumen belanja baru; ubah & hapus dokumen catatan sendiri selama belum dicairkan */
  | "belanja.buat"
  /** melihat semua dokumen belanja (saat ini dimiliki semua peran) */
  | "belanja.lihatSemua"
  /** mencentang belanja lalu membuat / membatalkan rekap pencairan */
  | "pencairan.rekap"
  /** mencentang belanja yang sudah dicairkan lalu membuat / membatalkan rekap pengesahan */
  | "pengesahan.sahkan"
  /** menambah data referensi */
  | "referensi.kelola"
  /** menambah, mengubah, menonaktifkan, menghapus pengguna */
  | "pengguna.kelola"
  /** melihat seluruh riwayat aktivitas (tanpa izin ini: aktivitas sendiri & aktivitas dokumen belanja) */
  | "aktivitas.semua"
  /** mengunggah FA Detail SAKTI untuk memperbarui Kertas Kerja POK */
  | "pok.unggah"
  /** Pengadaan sebagai PPK: Nota Dinas & HPS, lalu Kwitansi, BAP & BAST (masuk Daftar Pencairan) */
  | "pengadaan.ppk"
  /** Pengadaan sebagai Pejabat Pengadaan: Surat Pesanan ke penyedia & Nota Pembelian */
  | "pengadaan.pp";

interface AturanPeran {
  modul: Modul[];
  izin: Izin[];
  /** ringkasan tugas, tampil di halaman login */
  tugas: string;
}

export const AKSES: Record<Peran, AturanPeran> = {
  Administrator: {
    modul: ["dashboard", "pengadaan", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi", "pengguna"],
    izin: [
      "belanja.buat",
      "belanja.lihatSemua",
      "pencairan.rekap",
      "pengesahan.sahkan",
      "aktivitas.semua",
      "referensi.kelola",
      "pengguna.kelola",
      "pok.unggah",
      "pengadaan.ppk",
      "pengadaan.pp",
    ],
    tugas: "Kelola pengguna & referensi; boleh menjalankan pengadaan, mencatat, mencairkan, dan mengesahkan",
  },
  "Operator Pengadaan": {
    modul: ["dashboard", "pengadaan", "belanja", "aktivitas", "referensi"],
    izin: ["belanja.buat", "belanja.lihatSemua", "pok.unggah"],
    tugas: "Catat dokumen belanja kebutuhan unit kerja; unggah FA Detail",
  },
  "Operator Pencairan": {
    modul: ["dashboard", "pengadaan", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "pencairan.rekap", "aktivitas.semua"],
    tugas: "Centang belanja lalu cairkan (bayar ke penyedia / pihak ketiga)",
  },
  "Operator Pengesahan": {
    modul: ["dashboard", "pengadaan", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "pengesahan.sahkan", "aktivitas.semua"],
    tugas: "Centang belanja yang sudah dicairkan lalu sahkan",
  },
  "Pejabat Pengadaan": {
    modul: ["dashboard", "pengadaan", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "aktivitas.semua", "pengadaan.pp"],
    tugas: "Terbitkan Surat Pesanan ke penyedia dan catat Nota Pembelian",
  },
  PPK: {
    modul: ["dashboard", "pengadaan", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "aktivitas.semua", "pengadaan.ppk"],
    tugas: "Terbitkan Nota Dinas & HPS, lalu Kwitansi, BAP & BAST untuk pencairan",
  },
  Manajemen: {
    modul: ["dashboard", "pengadaan", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi"],
    izin: ["belanja.lihatSemua", "aktivitas.semua"],
    tugas: "Pantau pengadaan, dokumen belanja, pencairan, dan pengesahan",
  },
};

export const bolehModul = (peran: Peran, modul: Modul) => AKSES[peran]?.modul.includes(modul) ?? false;
export const bolehIzin = (peran: Peran, izin: Izin) => AKSES[peran]?.izin.includes(izin) ?? false;

/** Modul dari alamat halaman, mis. "/belanja" → "belanja" */
export function modulDariPath(path: string): Modul | null {
  const seg = path.split("/")[1] ?? "";
  const semua: Modul[] = ["dashboard", "pengadaan", "belanja", "aktivitas", "pencairan", "pengesahan", "referensi", "pengguna"];
  return (semua as string[]).includes(seg) ? (seg as Modul) : null;
}
