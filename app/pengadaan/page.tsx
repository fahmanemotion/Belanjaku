import type { Metadata } from "next";
import PengadaanView from "@/components/modules/Pengadaan";

export const metadata: Metadata = { title: "Pengadaan" };

export default function PengadaanPage() {
  return <PengadaanView />;
}
