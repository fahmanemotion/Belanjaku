"use client";

/**
 * Modul Pengesahan
 * - Daftar Belanja: belanja yang sudah masuk rekap pencairan tetapi belum disahkan (berceklist).
 *   Operator Keuangan / Bendahara mencentang belanja lalu klik "Sahkan" → satu rekap pengesahan.
 * - Riwayat       : rekap pengesahan beserta detail belanjanya.
 * Tampilan & aturan bersama ada di components/RekapBelanja.tsx.
 */
import RekapBelanja from "@/components/RekapBelanja";

export default function Pengesahan() {
  return <RekapBelanja jenis="pengesahan" />;
}
