import { json, readJson, route } from "@/lib/api/handler";
import { createProduct, listProducts } from "@/lib/products/repository";
import { productCreateSchema, productListQuerySchema } from "@/lib/products/schema";

// Viewers and admins can read.
export const GET = route({ permission: "product:read" }, async ({ req }) => {
  const params = productListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return json(await listProducts(params));
});

// Only admins can write: enforced here on the server, whatever the UI shows.
export const POST = route({ permission: "product:write" }, async ({ req, user }) => {
  const input = productCreateSchema.parse(await readJson(req));
  return json(await createProduct(input, user.uid), 201);
});
