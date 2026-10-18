import type { Metadata } from "next";
import AktivitasView from "@/components/modules/Aktivitas";

export const metadata: Metadata = { title: "Riwayat Aktivitas" };

export default function AktivitasPage() {
  return <AktivitasView />;
}
