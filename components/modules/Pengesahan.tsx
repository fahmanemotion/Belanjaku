"use client";

/**
 * Modul Pengesahan
 * - Daftar : kegiatan yang sudah dicairkan tetapi belum disahkan (ceklist).
 *            Operator Pengesahan (juga Bendahara Pengeluaran / Administrator) mencentang kegiatan lalu klik "Sahkan".
 *            Saat itulah sisa anggaran MAK di FA Detail berlaku (per MAK, dikurangi pengesahan sejak FA diunggah).
 * - Riwayat: tabel rekapan pengesahan (Pengesahan 01, 02, …: tanggal, sumber dana, nominal). Tombol aksi
 *            "Lihat daftar" mengganti tabel dengan daftar kegiatan yang sudah disahkan pada rekap itu.
 * Tampilan & aturan bersama ada di components/RekapBelanja.tsx.
 */
import RekapBelanja from "@/components/RekapBelanja";

export default function Pengesahan() {
  return <RekapBelanja jenis="pengesahan" />;
}
