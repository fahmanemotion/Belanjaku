export type SumberDana = "RM" | "BLU" | "HBH";

/**
 * Status dokumen belanja — diturunkan dari rekap di database:
 * dicatat pengadaan → masuk rekap pencairan → masuk rekap pengesahan.
 */
export type StatusBelanja = "Belum dicairkan" | "Dicairkan" | "Disahkan";

export type JenisDokumen = "Kwitansi" | "Kontrak" | "Honorarium" | "Gaji" | "Perjadin";

/** Mekanisme pembayaran pada rekap pencairan */
export type JenisPencairan = "LS" | "GU" | "TUP";

/**
 * Satu dokumen belanja yang mengalir lintas modul:
 * Belanja (dicatat bagian pengadaan) → Pencairan (rekap keuangan) → Pengesahan (rekap pengesahan).
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
  /** tanggal dokumen (YYYY-MM-DD) */
  tanggal: string;
  status: StatusBelanja;
  /** terisi setelah masuk rekap pencairan */
  pencairan?: { nomor: string; tanggal: string; jenis: JenisPencairan };
  /** terisi setelah masuk rekap pengesahan */
  pengesahan?: { nomor: string; tanggal: string };
  /** id pengguna pencatat dokumen — hanya dia yang boleh mengubah / menghapus selama belum dicairkan */
  dibuatOleh: string;
}

/* ---------- Rekap pencairan & pengesahan ---------- */

export type JenisRekap = "pencairan" | "pengesahan";

/** Satu rekap: kumpulan belanja satu sumber dana yang dicairkan / disahkan sekaligus */
export interface Rekap {
  /** CAIR-2026-0001 atau SAH-2026-0001 */
  nomor: string;
  jenisRekap: JenisRekap;
  /** tanggal pencairan / pengesahan (YYYY-MM-DD) */
  tanggal: string;
  dana: SumberDana;
  /** khusus rekap pencairan */
  jenisBayar?: JenisPencairan;
  /** nomor dokumen di SAKTI, mis. SP2D / SPM / SP3B */
  referensi?: string;
  catatan?: string;
  jumlah: number;
  total: number;
  dibuatOleh: string;
  /** waktu lokal ISO tanpa zona */
  dibuatPada: string;
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
  /** kalimat kerja huruf kecil, mis. "mencatat dokumen belanja" */
  aksi: string;
  /** id dokumen/objek, mis. BLJ-2026-0417 atau id pengguna */
  objekId?: string;
  /** nama objek, mis. uraian kegiatan */
  objekLabel?: string;
  perubahan?: PerubahanKolom[];
  catatan?: string;
}

export type Peran = "Administrator" | "Operator Pengadaan" | "Operator Keuangan" | "Bendahara Pengeluaran" | "PPK" | "PPSPM";

export interface Pengguna {
  id: string;
  nama: string;
  email: string;
  peran: Peran;
  /** unit kerja asal pengguna (boleh kosong: tidak terikat unit) */
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
