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
  /** terisi bila dokumen terbit dari paket pengadaan (Kwitansi oleh PPK); diubah lewat modul Pengadaan */
  paketId?: string;
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

/**
 * Sisa anggaran satu MAK untuk kegiatan yang akan disahkan (RPC cek_anggaran_pengesahan).
 * Sisa = sisaFa − terpakai; pengesahan ditolak bila usul melebihi sisa.
 */
export interface AnggaranMak {
  mak: string;
  /** MAK ada di FA Detail (Kertas Kerja POK) yang aktif */
  ada: boolean;
  /** pagu − lock − realisasi pada FA Detail aktif (kosong bila MAK tidak ada) */
  sisaFa?: number;
  /** kegiatan MAK ini yang sudah disahkan sejak FA Detail itu diunggah */
  terpakai: number;
  /** total nilai kegiatan terpilih pada MAK ini */
  usul: number;
  jumlah: number;
  /** waktu lokal FA Detail aktif diunggah */
  berlakuSejak?: string;
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

export type ModulAktivitas = "Belanja" | "Pengadaan" | "Pencairan" | "Pengesahan" | "Pengguna" | "Referensi" | "Sistem";

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

export type Peran =
  | "Administrator"
  | "Operator Pengadaan"
  | "Operator Pencairan"
  | "Operator Pengesahan"
  | "Pejabat Pengadaan"
  | "PPK"
  | "Manajemen";

export interface Pengguna {
  id: string;
  nama: string;
  email: string;
  /** pengguna hanya dibedakan menurut peran (tidak terikat unit kerja) */
  peran: Peran;
  aktif: boolean;
  /** profil akun yang sudah dihapus (tetap disimpan agar riwayat terbaca) */
  dihapus?: boolean;
  /** data penanda tangan dokumen pengadaan (PPK & Pejabat Pengadaan) */
  nip?: string;
  /** pangkat/golongan, mis. Penata (III/c) */
  pangkat?: string;
  /** SK penunjukan PPK (dicetak di BAP) */
  skNomor?: string;
  skTanggal?: string;
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
  /** data pembayaran yang dicetak di dokumen pengadaan (Surat Pesanan s.d. Kwitansi) */
  alamat: string;
  pimpinan: string;
  /** jabatan pimpinan, mis. Direktur */
  jabatan: string;
  npwp: string;
  bank: string;
  rekening: string;
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

/* ---------- Pengadaan: alur dokumen Kwitansi ---------- */

/**
 * 1 Nota Dinas & HPS (PPK) → 2 Surat Pesanan (Pejabat Pengadaan) → 3 Nota Pembelian (Pejabat Pengadaan)
 * → 4 Kwitansi, BAP & BAST (PPK; otomatis menjadi dokumen belanja di Daftar Pencairan)
 */
export type TahapPaket = 1 | 2 | 3 | 4;

/** Satu barang/jasa pada HPS */
export interface ItemPaket {
  uraian: string;
  /** baris spesifikasi, dicetak "- …" di bawah uraian */
  spesifikasi: string[];
  jumlah: number;
  satuan: string;
  /** harga satuan HPS */
  hargaHps: number;
  /** harga satuan pembelian (Nota Pembelian, tahap 3) */
  harga?: number;
  ket: string;
}

/** Data penyedia yang dicetak */
export interface DataPenyedia {
  id?: string;
  nama: string;
  pimpinan: string;
  jabatan: string;
  alamat: string;
  kota: string;
  npwp: string;
  bank: string;
  rekening: string;
}

/** Data pejabat penanda tangan yang dicetak */
export interface DataPejabat {
  id?: string;
  nama: string;
  nip?: string;
  pangkat?: string;
  skNomor?: string;
  skTanggal?: string;
}

export interface Paket {
  /** PKT-2026-0001 */
  id: string;
  tahun: number;
  tahap: TahapPaket;
  pekerjaan: string;
  unit: string;
  dana: SumberDana;
  mak: string;
  item: ItemPaket[];
  /** PPN 11% pada HPS */
  ppn: boolean;
  nd: { nomor: string; tanggal: string };
  ppkId: string;
  ppId?: string;
  penyediaId?: string;
  /** isian tahap yang dibatalkan tetap tersimpan (dipakai mengisi ulang form); berlaku bila tahap sudah dicapai */
  sp?: { nomor: string; tanggal: string; batasHari: number };
  nota?: { tanggal: string; ppn: boolean };
  kwitansi?: { nomor: string; tanggal: string };
  bap?: { nomor: string; tanggal: string; centang: boolean };
  bast?: { nomor: string; tanggal: string };
  /** dokumen belanja (BLJ-…) hasil kwitansi */
  pengajuanId?: string;
  /** salinan data penyedia & pejabat saat kwitansi terbit */
  arsip?: { penyedia?: DataPenyedia; ppk?: DataPejabat; pp?: DataPejabat };
  dibuatOleh: string;
  dibuatPada: string;
  diubahPada: string;
}
