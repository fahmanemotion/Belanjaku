import type { Metadata } from "next";
import BelanjaView from "@/components/modules/Belanja";

export const metadata: Metadata = { title: "Belanja" };

export default function BelanjaPage() {
  return <BelanjaView />;
}
