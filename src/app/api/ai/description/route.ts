import { z } from "zod";
import { getDescriptionProvider } from "@/lib/ai";
import { createRateLimiter } from "@/lib/ai/rateLimit";
import { sanitizeDescription } from "@/lib/ai/sanitize";
import { ApiError } from "@/lib/api/errors";
import { json, readJson, route } from "@/lib/api/handler";
import { productCreateSchema } from "@/lib/products/schema";

// Reuse the product field rules so the model only ever sees data that would be a
// valid product, and name length is already capped.
const { name, category, priceCents } = productCreateSchema.shape;
const bodySchema = z.strictObject({ name, category, priceCents });

// 10 drafts per admin per minute.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });

export const POST = route({ permission: "ai:generate" }, async ({ req, user }) => {
  const input = bodySchema.parse(await readJson(req));

  const { allowed, retryAfterSeconds } = limiter.take(user.uid);
  if (!allowed) {
    throw new ApiError("rate_limited", "Too many requests, please wait a moment", { retryAfterSeconds });
  }

  const provider = getDescriptionProvider();
  const description = sanitizeDescription(await provider.generate(input));
  return json({ description, provider: provider.name });
});
