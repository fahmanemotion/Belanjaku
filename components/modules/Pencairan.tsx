"use client";

/**
 * Modul Pencairan
 * - Daftar : kegiatan dari bagian pengadaan yang belum dicairkan (ceklist).
 *            Operator Pencairan (satu akun; juga Administrator) mencentang kegiatan yang
 *            dibayarkan ke penyedia / pihak ketiga lalu klik "Cairkan".
 * - Riwayat: tabel rekapan pencairan (Pencairan 01, 02, …: tanggal, sumber dana, nominal). Tombol aksi
 *            "Lihat daftar" mengganti tabel dengan daftar kegiatan yang sudah dicairkan pada rekap itu.
 *            Kegiatan yang sudah dicairkan otomatis masuk Daftar di modul Pengesahan.
 * Tampilan & aturan bersama ada di components/RekapBelanja.tsx.
 */
import RekapBelanja from "@/components/RekapBelanja";

export default function Pencairan() {
  return <RekapBelanja jenis="pencairan" />;
}
