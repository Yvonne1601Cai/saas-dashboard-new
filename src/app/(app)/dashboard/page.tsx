import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";
import { requireUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Products | Catalog" };

export default async function DashboardPage() {
  const user = await requireUser();
  return <Dashboard role={user.role} />;
}
