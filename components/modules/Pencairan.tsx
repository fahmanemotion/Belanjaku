"use client";

/**
 * Modul Pencairan
 * - Daftar Belanja: dokumen belanja dari bagian pengadaan yang belum dicairkan (berceklist).
 *   Operator Keuangan / Bendahara mencentang belanja lalu klik "Cairkan" → satu rekap pencairan.
 * - Riwayat       : rekap pencairan beserta detail belanjanya. Belanja yang sudah dicairkan
 *   otomatis masuk Daftar Belanja di modul Pengesahan.
 * Tampilan & aturan bersama ada di components/RekapBelanja.tsx.
 */
import RekapBelanja from "@/components/RekapBelanja";

export default function Pencairan() {
  return <RekapBelanja jenis="pencairan" />;
}
