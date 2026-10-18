import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./session.ts";

/**
 * The verified user for the current request, or null.
 * `cache` makes layout + page share one verification per render pass.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return cookie ? verifySession(cookie) : null;
});

/** For Server Components: the real authentication check (proxy.ts only does an optimistic one). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
