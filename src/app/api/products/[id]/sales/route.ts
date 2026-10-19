import { ApiError } from "@/lib/api/errors";
import { json, readJson, route } from "@/lib/api/handler";
import { recordSale } from "@/lib/products/repository";
import { productIdSchema, saleCreateSchema } from "@/lib/products/schema";

type Params = { id: string };

export const POST = route<Params>({ permission: "product:write" }, async ({ req, params, user }) => {
  const id = productIdSchema.parse(params.id);
  const input = saleCreateSchema.parse(await readJson(req));
  const result = await recordSale(id, input, user.uid);
  if (!result) throw new ApiError("not_found", "Product not found");
  return json(result, 201);
});
