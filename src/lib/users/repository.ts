// User administration on top of Firebase Auth. The role is a custom claim, so
// Firebase Auth is the single source of truth and there is no second copy in
// Firestore that could disagree with it.
import "server-only";
import { adminAuth } from "../firebase/admin.ts";
import { ApiError } from "../api/errors.ts";
import { parseRole, type Role } from "../auth/roles.ts";

export interface AdminUserView {
  uid: string;
  email: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
  lastSignInAt: string | null;
}

const MAX_USERS = 100;

export async function listUsers(): Promise<AdminUserView[]> {
  const result = await adminAuth.listUsers(MAX_USERS);
  return result.users.map((u) => ({
    uid: u.uid,
    email: u.email ?? "(no email)",
    role: parseRole(u.customClaims?.role),
    disabled: u.disabled,
    createdAt: new Date(u.metadata.creationTime).toISOString(),
    lastSignInAt: u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).toISOString() : null,
  }));
}

/**
 * Sets a user's role, then revokes their refresh tokens. Session cookies are
 * verified with checkRevoked, so the user's next request is rejected and they
 * must sign in again, which mints a session carrying the new role. Without the
 * revoke, a demoted admin would keep admin rights until their cookie expired.
 */
export async function setUserRole(uid: string, role: Role): Promise<void> {
  let user;
  try {
    user = await adminAuth.getUser(uid);
  } catch {
    throw new ApiError("not_found", "User not found");
  }
  // Merge so any other custom claims survive.
  await adminAuth.setCustomUserClaims(uid, { ...user.customClaims, role });
  await adminAuth.revokeRefreshTokens(uid);
}
