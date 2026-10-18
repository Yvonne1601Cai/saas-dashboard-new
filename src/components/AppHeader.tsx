"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import { can, type Role } from "@/lib/auth/roles";
import { Badge, Button } from "./ui";

export function AppHeader({ email, role }: { email: string; role: Role }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const links = [
    { href: "/dashboard", label: "Products" },
    ...(can(role, "user:manage") ? [{ href: "/admin/users", label: "Users" }] : []),
  ];

  async function signOut() {
    setSigningOut(true);
    try {
      await api("/api/auth/session", { method: "DELETE" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="text-base font-semibold text-slate-900">Catalog</span>
          <nav aria-label="Main" className="flex gap-1">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-indigo-600 ${
                    active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="max-w-[14rem] truncate text-sm text-slate-600" title={email}>
            {email}
          </span>
          <Badge tone={role === "admin" ? "indigo" : "gray"}>{role}</Badge>
          <Button variant="secondary" onClick={signOut} disabled={signingOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
