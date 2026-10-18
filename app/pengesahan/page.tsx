import type { Metadata } from "next";
import PengesahanView from "@/components/modules/Pengesahan";

export const metadata: Metadata = { title: "Pengesahan" };

export default function PengesahanPage() {
  return <PengesahanView />;
}
