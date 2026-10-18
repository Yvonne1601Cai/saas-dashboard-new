import type { Metadata } from "next";
import { UsersAdmin } from "@/components/UsersAdmin";
import { requireUser } from "@/lib/auth/guards";
import { can } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Users | Catalog" };

export default async function UsersPage() {
  const user = await requireUser();

  // Server-side role check: non-admins never receive this page's component or data.
  if (!can(user.role, "user:manage")) {
    return (
      <div role="alert" className="rounded-lg bg-white p-10 text-center ring-1 ring-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">Not authorized</h1>
        <p className="mt-1 text-sm text-slate-600">Only admins can manage users.</p>
      </div>
    );
  }
  return <UsersAdmin currentUid={user.uid} />;
}
