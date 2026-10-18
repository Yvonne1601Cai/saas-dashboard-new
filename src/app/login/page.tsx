import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth/guards";

export default async function LoginPage() {
  // Verified, not just "has a cookie", so a stale cookie cannot cause a redirect loop with proxy.ts.
  if (await getSessionUser()) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">Catalog</h1>
      <p className="mt-1 text-sm text-slate-600">Sign in to manage your products.</p>
      <div className="mt-6 rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <LoginForm showDemoHint={process.env.NEXT_PUBLIC_USE_EMULATORS === "true"} />
      </div>
    </main>
  );
}
