"use client";

/**
 * Modul Pengesahan
 * - Daftar : kegiatan yang sudah dicairkan tetapi belum disahkan (ceklist).
 *            Operator Pengesahan (juga Bendahara Pengeluaran / Administrator) mencentang kegiatan lalu klik "Sahkan".
 * - Riwayat: histori kegiatan yang sudah disahkan (per kegiatan atau per rekap).
 * Tampilan & aturan bersama ada di components/RekapBelanja.tsx.
 */
import RekapBelanja from "@/components/RekapBelanja";

export default function Pengesahan() {
  return <RekapBelanja jenis="pengesahan" />;
}
