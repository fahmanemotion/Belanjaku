import type { Metadata } from "next";
import DashboardView from "@/components/modules/Dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return <DashboardView />;
}
