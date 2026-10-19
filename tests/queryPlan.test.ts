import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fieldOverrides, planListQuery, requiredIndexes } from "../src/lib/products/queryPlan.ts";
import { productListQuerySchema } from "../src/lib/products/schema.ts";

const plan = (query: Record<string, string>) => planListQuery(productListQuerySchema.parse(query));

describe("planListQuery", () => {
  it("defaults to newest first with no filters", () => {
    expect(plan({})).toEqual({ equality: [], prefix: undefined, orderField: "createdAt", dir: "desc" });
  });

  it("maps API sort keys to stored fields", () => {
    expect(plan({ sort: "price", dir: "asc" })).toMatchObject({ orderField: "priceCents", dir: "asc" });
    expect(plan({ sort: "name" })).toMatchObject({ orderField: "nameLower" });
  });

  it("orders equality filters deterministically", () => {
    expect(plan({ status: "active", category: "Cakes" }).equality).toEqual([
      { field: "category", value: "Cakes" },
      { field: "status", value: "active" },
    ]);
  });

  it("forces name ordering when searching, because Firestore range filters require it", () => {
    const searching = plan({ q: "  WiDg ", sort: "price", dir: "asc" });
    expect(searching).toMatchObject({ prefix: "widg", orderField: "nameLower", dir: "asc" });
  });

  it("treats a blank search as no search", () => {
    expect(plan({ q: "   " }).prefix).toBeUndefined();
  });
});

describe("indexes", () => {
  it("every filtered query the API allows has a matching composite index", () => {
    const have = new Set(requiredIndexes().map((i) => JSON.stringify(i.fields)));
    const statuses = [undefined, "active", "inactive"];
    const categories = [undefined, "Bread", "Other"];
    for (const status of statuses) {
      for (const category of categories) {
        for (const sort of ["createdAt", "price", "name"]) {
          for (const dir of ["asc", "desc"]) {
            for (const q of [undefined, "abc"]) {
              const p = planListQuery(
                productListQuerySchema.parse(
                  Object.fromEntries(
                    Object.entries({ status, category, sort, dir, q }).filter(([, v]) => v !== undefined),
                  ),
                ),
              );
              if (p.equality.length === 0) continue; // served by automatic single-field indexes
              const needed = [
                ...p.equality.map((e) => ({ fieldPath: e.field, order: "ASCENDING" })),
                { fieldPath: p.orderField, order: p.dir === "asc" ? "ASCENDING" : "DESCENDING" },
              ];
              expect(have, JSON.stringify(needed)).toContain(JSON.stringify(needed));
            }
          }
        }
      }
    }
  });

  it("firestore.indexes.json is in sync (run `npm run indexes:generate` if this fails)", () => {
    const committed = JSON.parse(
      readFileSync(new URL("../firestore.indexes.json", import.meta.url), "utf8"),
    );
    expect(committed.indexes).toEqual(requiredIndexes());
    expect(committed.fieldOverrides).toEqual(fieldOverrides());
  });
});

describe("unindexed fields", () => {
  it("never switches off an index that a query or aggregation depends on", () => {
    const needed = [
      ...["status", "category", "createdAt", "priceCents", "nameLower"].map((f) => `products.${f}`),
      "sales.amountCents",
    ];
    const off = fieldOverrides().map((o) => `${o.collectionGroup}.${o.fieldPath}`);
    for (const field of needed) expect(off).not.toContain(field);
  });
});
