import { json, route } from "@/lib/api/handler";
import { getMetrics } from "@/lib/products/repository";

export const GET = route({ permission: "product:read" }, async () => json(await getMetrics()));
