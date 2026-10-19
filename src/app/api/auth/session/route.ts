import { cookies } from "next/headers";
import { z } from "zod";
import { json, readJson, route } from "@/lib/api/handler";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSession, endSession } from "@/lib/auth/session";
import { log } from "@/lib/logger";

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

/** Sign out: revoke the session in Firebase, then clear the cookie. */
export const DELETE = route({ public: true }, async ({ requestId }) => {
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE)?.value;
  if (session) {
    try {
      await endSession(session);
    } catch (error) {
      // Still clear the cookie below so the browser is signed out; the failed
      // revocation is logged because the cookie would stay valid until it expires.
      log("error", "session revocation failed", {
        requestId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  jar.set(SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
  return new Response(null, { status: 204 });
});
