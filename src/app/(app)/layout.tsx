import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { Providers } from "@/components/Providers";
import { requireUser } from "@/lib/auth/guards";

// Every page in this group requires a verified session. This is the real
// authentication check (proxy.ts only does a cheap cookie-exists redirect).
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return (
    <Providers>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <AppHeader email={user.email} role={user.role} />
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </Providers>
  );
}
