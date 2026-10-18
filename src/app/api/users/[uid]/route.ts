import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { json, readJson, route } from "@/lib/api/handler";
import { ROLES } from "@/lib/auth/roles";
import { setUserRole } from "@/lib/users/repository";

const uidSchema = z.string().min(1).max(128);
const bodySchema = z.strictObject({ role: z.enum(ROLES) });

export const PATCH = route<{ uid: string }>(
  { permission: "user:manage" },
  async ({ req, params, user }) => {
    const uid = uidSchema.parse(params.uid);
    const { role } = bodySchema.parse(await readJson(req));
    // An admin demoting themselves could leave the system with no admin at all.
    if (uid === user.uid) throw new ApiError("bad_request", "You cannot change your own role");
    await setUserRole(uid, role);
    return json({ uid, role });
  },
);
