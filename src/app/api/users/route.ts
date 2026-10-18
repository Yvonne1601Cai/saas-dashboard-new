import { json, route } from "@/lib/api/handler";
import { listUsers } from "@/lib/users/repository";

export const GET = route({ permission: "user:manage" }, async () => json({ items: await listUsers() }));
