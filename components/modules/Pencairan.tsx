"use client";

/**
 * Modul Pencairan
 * - Daftar : kegiatan dari bagian pengadaan yang belum dicairkan (ceklist).
 *            Operator Keuangan (juga Bendahara Pengeluaran / Administrator) mencentang kegiatan yang
 *            dibayarkan ke penyedia / pihak ketiga lalu klik "Cairkan".
 * - Riwayat: histori kegiatan yang sudah dicairkan (per kegiatan atau per rekap). Kegiatan yang sudah
 *            dicairkan otomatis masuk Daftar di modul Pengesahan.
 * Tampilan & aturan bersama ada di components/RekapBelanja.tsx.
 */
import RekapBelanja from "@/components/RekapBelanja";

export default function Pencairan() {
  return <RekapBelanja jenis="pencairan" />;
}
