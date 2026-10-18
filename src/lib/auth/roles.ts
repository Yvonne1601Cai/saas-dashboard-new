// Roles and permissions. This file has no server-only imports on purpose: the UI
// uses it to decide which controls to show and the API uses the very same
// function to decide what to allow, so the two can never drift apart.

export const ROLES = ["admin", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | "product:read"
  | "product:write"
  | "ai:generate"
  | "user:manage";

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  viewer: new Set<Permission>(["product:read"]),
  admin: new Set<Permission>([
    "product:read",
    "product:write",
    "ai:generate",
    "user:manage",
  ]),
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].has(permission);
}

/**
 * Turns an untrusted custom-claim value into a Role.
 * Anything that is not exactly "admin" (missing, misspelled, wrong type) becomes
 * "viewer". Failing towards the least-privileged role means a new sign-up never
 * needs a server round-trip to be safe, and only admins have to be stored.
 */
export function parseRole(value: unknown): Role {
  return value === "admin" ? "admin" : "viewer";
}
