import type { Metadata } from "next";
import PencairanView from "@/components/modules/Pencairan";

export const metadata: Metadata = { title: "Pencairan" };

export default function PencairanPage() {
  return <PencairanView />;
}
