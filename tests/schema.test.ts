import { describe, expect, it } from "vitest";
import {
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
} from "../src/lib/products/schema.ts";

const valid = { name: "Widget", category: "Hardware", priceCents: 1999, status: "active" };

describe("productCreateSchema", () => {
  it("accepts a valid product and applies defaults", () => {
    expect(productCreateSchema.parse(valid)).toEqual({ ...valid, unitsSold: 0, description: "" });
  });

  it("trims the name", () => {
    expect(productCreateSchema.parse({ ...valid, name: "  Widget  " }).name).toBe("Widget");
  });

  it.each([
    ["blank name", { name: "   " }],
    ["unknown category", { category: "Weapons" }],
    ["unknown status", { status: "deleted" }],
    ["negative price", { priceCents: -1 }],
    ["fractional cents", { priceCents: 10.5 }],
    ["price above the cap", { priceCents: 10_000_001 }],
    ["string price", { priceCents: "100" }],
    ["negative units", { unitsSold: -1 }],
  ])("rejects %s", (_label, override) => {
    expect(productCreateSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("rejects server-controlled fields, so clients cannot set them", () => {
    for (const extra of [{ createdBy: "x" }, { revenueCents: 1 }, { nameLower: "x" }, { id: "x" }]) {
      expect(productCreateSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
  });
});

describe("productUpdateSchema", () => {
  it("allows a partial patch and does not invent defaults", () => {
    const parsed = productUpdateSchema.parse({ priceCents: 500 });
    expect(parsed).toEqual({ priceCents: 500 }); // description/unitsSold must stay absent
  });

  it("rejects an empty patch and unknown fields", () => {
    expect(productUpdateSchema.safeParse({}).success).toBe(false);
    expect(productUpdateSchema.safeParse({ createdBy: "x" }).success).toBe(false);
  });
});

describe("productListQuerySchema", () => {
  it("applies defaults", () => {
    expect(productListQuerySchema.parse({})).toMatchObject({ sort: "createdAt", dir: "desc", limit: 10 });
  });

  it("coerces limit from the query string and caps it", () => {
    expect(productListQuerySchema.parse({ limit: "25" }).limit).toBe(25);
    expect(productListQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("rejects values that are not allowed sort keys or filters", () => {
    expect(productListQuerySchema.safeParse({ sort: "revenue" }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ status: "all" }).success).toBe(false);
  });
});
