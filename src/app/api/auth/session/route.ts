import { cookies } from "next/headers";
import { z } from "zod";
import { json, readJson, route } from "@/lib/api/handler";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSession } from "@/lib/auth/session";

const bodySchema = z.strictObject({ idToken: z.string().min(20).max(4096) });

const cookieBase = {
  httpOnly: true, // not readable from JavaScript, so XSS cannot steal the session
  secure: process.env.NODE_ENV === "production", // HTTPS only in production
  sameSite: "lax" as const, // not sent on cross-site POSTs; still works for links into the app
  path: "/",
};

/** Sign in: trade a freshly issued Firebase ID token for a session cookie. */
export const POST = route({ public: true }, async ({ req }) => {
  const { idToken } = bodySchema.parse(await readJson(req));
  const { cookie, user } = await createSession(idToken);
  (await cookies()).set(SESSION_COOKIE, cookie, { ...cookieBase, maxAge: SESSION_MAX_AGE_SECONDS });
  return json({ user });
});

/** Sign out: clear the cookie. */
export const DELETE = route({ public: true }, async () => {
  (await cookies()).set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return new Response(null, { status: 204 });
});
