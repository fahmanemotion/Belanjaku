export type SumberDana = "RM" | "BLU" | "HBH";

/** Status pengajuan di modul Belanja */
export type StatusBelanja = "Draf" | "Diajukan" | "Diverifikasi" | "Disetujui" | "Ditolak";

export type JenisDokumen = "Kwitansi" | "Kontrak" | "Honorarium" | "Gaji" | "Perjadin";

export type JenisSpp = "LS" | "GU" | "TUP";

/** 1 = SPP, 2 = Verifikasi PPSPM, 3 = SPM, 4 = SP2D terbit */
export type TahapPencairan = 1 | 2 | 3 | 4;

/**
 * Satu kegiatan belanja yang mengalir lintas modul:
 * Belanja (pengajuan & persetujuan) → Pencairan (SPP s.d. SP2D) → Pengesahan.
 * Semua tabel kegiatan (Dashboard, Belanja, Pencairan, Pengesahan) membaca data ini.
 */
export interface Kegiatan {
  id: string;
  uraian: string;
  noDokumen: string;
  jenisDokumen: JenisDokumen;
  /** id penyedia di tabel referensi */
  penyediaId: string;
  /** nama penyedia (untuk tampilan) */
  penyedia: string;
  dana: SumberDana;
  /** Mata Anggaran Kegiatan sesuai kertas kerja DIPA, mis. 1975.DAB.002.051.A.521211 */
  mak: string;
  /** akun = segmen terakhir MAK (disimpan agar tabel & filter tetap cepat) */
  akun: string;
  unit: string;
  nilai: number;
  /** tanggal dokumen / pengajuan (YYYY-MM-DD) */
  tanggal: string;
  status: StatusBelanja;
  /** terisi setelah SPP dibuat di modul Pencairan */
  spp?: { no: string; jenis: JenisSpp; tahap: TahapPencairan; tanggal: string };
  /** terisi setelah disahkan di modul Pengesahan */
  disahkan?: { nomor: string; tanggal: string };
  /** id pengguna yang membuat pengajuan — hanya dia yang boleh mengubah / menghapus */
  dibuatOleh: string;
}

/* ---------- Riwayat aktivitas (jejak audit) ---------- */

export type JenisAktivitas =
  | "Buat"
  | "Ubah"
  | "Hapus"
  | "Cetak"
  | "Status"
  | "Pencairan"
  | "Pengesahan"
  | "Pengguna"
  | "Referensi"
  | "Sesi";

export type ModulAktivitas = "Belanja" | "Pencairan" | "Pengesahan" | "Pengguna" | "Referensi" | "Sistem";

/** Satu kolom yang berubah: nilai sebelum → sesudah (sudah dalam bentuk teks siap tampil) */
export interface PerubahanKolom {
  kolom: string;
  dari: string;
  ke: string;
}

/** Satu baris log: siapa melakukan apa, kapan, pada dokumen mana */
export interface Aktivitas {
  id: string;
  /** waktu lokal ISO tanpa zona: 2026-10-18T13:38:05 */
  waktu: string;
  /** id pengguna pelaku */
  oleh: string;
  jenis: JenisAktivitas;
  modul: ModulAktivitas;
  /** kalimat kerja huruf kecil, mis. "mengajukan ke PPK" */
  aksi: string;
  /** id dokumen/objek, mis. BLJ-2026-0417 atau id pengguna */
  objekId?: string;
  /** nama objek, mis. uraian kegiatan */
  objekLabel?: string;
  perubahan?: PerubahanKolom[];
  catatan?: string;
}

/** Rekap pengesahan per periode: outstanding = pencairan − pengesahan */
export interface Sp3bBlu {
  nomor: string;
  periode: string;
  /** "2026-10" */
  bulan: string;
  pencairan: number;
  pengesahan: number;
}

export type Peran = "Administrator" | "PPK" | "PPSPM" | "Bendahara Pengeluaran" | "Operator Unit";

export interface Pengguna {
  id: string;
  nama: string;
  email: string;
  peran: Peran;
  /** kosong untuk peran di luar Operator Unit yang tidak terikat unit */
  unit: string;
  aktif: boolean;
  /** profil akun yang sudah dihapus (tetap disimpan agar riwayat terbaca) */
  dihapus?: boolean;
}

export interface RefAkun {
  kode: string;
  uraian: string;
  jenis: string;
}

export interface RefUnit {
  kode: string;
  nama: string;
  penanggungJawab: string;
}

export interface RefPenyedia {
  id: string;
  nama: string;
  bidang: string;
  kota: string;
  aktif: boolean;
}

export interface RefDana {
  kode: SumberDana | string;
  nama: string;
  warna: string;
}

export interface Referensi {
  akun: RefAkun[];
  unit: RefUnit[];
  penyedia: RefPenyedia[];
  dana: RefDana[];
}
