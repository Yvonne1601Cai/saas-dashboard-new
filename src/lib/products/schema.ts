// Shared contract for products: used by the API (to validate input) and by the
// forms (to give instant feedback). Money is always integer cents; floats are
// never stored or summed.
import { z } from "zod";

export const PRODUCT_CATEGORIES = [
  "Bread",
  "Pastries",
  "Cakes",
  "Cookies",
  "Drinks",
  "Other",
] as const;
export const PRODUCT_STATUSES = ["active", "inactive"] as const;
export const SORT_KEYS = ["createdAt", "price", "name"] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

// Every unit sells at most at MAX_PRICE_CENTS and a product's unitsSold is capped,
// so a product's revenueCents stays far below 2^53 and is always an exact integer.
export const MAX_PRICE_CENTS = 10_000_000; // $100,000.00
export const MAX_UNITS_SOLD = 10_000_000;
export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 1000;

/** Firestore auto-ids are 20 alphanumeric characters; reject anything else early. */
export const productIdSchema = z.string().regex(/^[A-Za-z0-9]{1,64}$/, "Invalid id");

const fields = {
  name: z.string().trim().min(1, "Name is required").max(MAX_NAME_LENGTH),
  category: z.enum(PRODUCT_CATEGORIES),
  priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS),
  status: z.enum(PRODUCT_STATUSES),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH),
};

// strictObject: unknown keys are rejected, so a client cannot smuggle in
// server-controlled fields such as createdBy, revenueCents or nameLower.
// unitsSold and revenueCents only change by recording a sale.
export const productCreateSchema = z.strictObject({
  ...fields,
  description: fields.description.default(""),
});

// Defaults are deliberately absent here: with a default, an omitted field in a
// PATCH would silently overwrite the stored value.
export const productUpdateSchema = z
  .strictObject(fields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one field to update",
  });

export const productListQuerySchema = z.object({
  status: z.enum(PRODUCT_STATUSES).optional(),
  category: z.enum(PRODUCT_CATEGORIES).optional(),
  q: z.string().trim().max(60).optional(),
  sort: z.enum(SORT_KEYS).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().max(600).optional(),
});

// Positive only: a refund must reverse a specific sale at the price it was sold
// for, not subtract units at today's price.
export const saleCreateSchema = z.strictObject({
  quantity: z.number().int().min(1).max(MAX_UNITS_SOLD),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductListParams = z.infer<typeof productListQuerySchema>;
export type SaleCreateInput = z.infer<typeof saleCreateSchema>;

/** What the API returns. Internal fields (nameLower, createdBy, ...) are not exposed. */
export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  priceCents: number;
  status: ProductStatus;
  unitsSold: number;
  revenueCents: number;
  description: string;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

/** One recorded sale. The price is captured at the time of sale, so later price edits never change it. */
export interface Sale {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  createdAt: string; // ISO 8601
}

export interface ProductPage {
  items: Product[];
  nextCursor: string | null;
}

export interface Metrics {
  totalProducts: number;
  activeProducts: number;
  revenueCents: number;
  averagePriceCents: number | null;
}
