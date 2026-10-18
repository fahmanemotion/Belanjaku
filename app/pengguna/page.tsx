import type { Metadata } from "next";
import PenggunaView from "@/components/modules/Pengguna";

export const metadata: Metadata = { title: "Pengguna" };

export default function PenggunaPage() {
  return <PenggunaView />;
}
