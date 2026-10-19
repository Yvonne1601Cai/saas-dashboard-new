import "server-only";
import { adminAuth } from "../firebase/admin.ts";
import { ApiError } from "../api/errors.ts";
import { parseRole, type Role } from "./roles.ts";

export const SESSION_COOKIE = "__session"; // the one cookie name Firebase Hosting forwards
export const SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60; // 5 days (Firebase allows 5 min to 14 days)
// Firebase's own guidance: only mint a session from a *fresh* sign-in, so a stolen
// old ID token cannot be traded for a long-lived session.
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

export interface SessionUser {
  uid: string;
  email: string;
  role: Role;
}

/**
 * Exchanges a Firebase ID token for a server-managed session cookie.
 * The ID token travels once, in a POST body, never in a URL, and is not kept.
 */
export async function createSession(idToken: string) {
  let decoded;
  try {
    // checkRevoked=true also rejects tokens of disabled users and revoked sessions.
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch {
    throw new ApiError("unauthorized", "Invalid or expired sign-in token");
  }
  if (Date.now() / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_SECONDS) {
    throw new ApiError("unauthorized", "Please sign in again");
  }
  // Sign-up is open, so without this anyone could register someone else's address
  // (say, the CEO's), read the catalogue, and look trustworthy on the Users page.
  if (!decoded.email_verified) {
    throw new ApiError("forbidden", "Verify your email address before signing in. Check your inbox for the link.");
  }
  const cookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });
  return {
    cookie,
    user: { uid: decoded.uid, email: decoded.email ?? "", role: parseRole(decoded.role) },
  };
}

/**
 * Ends the session on the server, not just in the browser. Revoking the user's
 * refresh tokens makes verifySession (checkRevoked) reject this cookie even if a
 * copy of it survives. Firebase revokes per user, so this signs out every device.
 */
export async function endSession(cookie: string): Promise<void> {
  let uid: string;
  try {
    uid = (await adminAuth.verifySessionCookie(cookie)).uid;
  } catch {
    return; // expired or forged: there is no session to end
  }
  await adminAuth.revokeRefreshTokens(uid);
}

/** Returns the session user, or null for a missing, expired, forged or revoked cookie. */
export async function verifySession(cookie: string): Promise<SessionUser | null> {
  try {
    // checkRevoked=true costs one Auth lookup per request, but it is what makes
    // "change a role" or "disable a user" take effect immediately instead of
    // after the cookie expires (see README, "Security decisions").
    const decoded = await adminAuth.verifySessionCookie(cookie, true);
    return { uid: decoded.uid, email: decoded.email ?? "", role: parseRole(decoded.role) };
  } catch {
    return null;
  }
}
