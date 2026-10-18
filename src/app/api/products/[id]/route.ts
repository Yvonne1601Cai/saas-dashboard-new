import { ApiError } from "@/lib/api/errors";
import { json, readJson, route } from "@/lib/api/handler";
import { deleteProduct, getProduct, updateProduct } from "@/lib/products/repository";
import { productIdSchema, productUpdateSchema } from "@/lib/products/schema";

type Params = { id: string };

const notFound = () => new ApiError("not_found", "Product not found");

export const GET = route<Params>({ permission: "product:read" }, async ({ params }) => {
  const product = await getProduct(productIdSchema.parse(params.id));
  if (!product) throw notFound();
  return json(product);
});

export const PATCH = route<Params>({ permission: "product:write" }, async ({ req, params, user }) => {
  const id = productIdSchema.parse(params.id);
  const patch = productUpdateSchema.parse(await readJson(req));
  const product = await updateProduct(id, patch, user.uid);
  if (!product) throw notFound();
  return json(product);
});

export const DELETE = route<Params>({ permission: "product:write" }, async ({ params }) => {
  const deleted = await deleteProduct(productIdSchema.parse(params.id));
  if (!deleted) throw notFound();
  return new Response(null, { status: 204 });
});
