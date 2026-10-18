// Runs the real repository against the Firestore emulator (npm run test:integration).
import { beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../../src/lib/api/errors.ts";
import {
  createProduct,
  deleteProduct,
  getMetrics,
  getProduct,
  listProducts,
  updateProduct,
} from "../../src/lib/products/repository.ts";
import {
  productListQuerySchema,
  type Product,
  type ProductCreateInput,
} from "../../src/lib/products/schema.ts";

const ACTOR = "test-admin";

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const res = await fetch(
    `http://${host}/emulator/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Could not clear emulator: ${res.status}. Is it running?`);
}

const input = (over: Partial<ProductCreateInput> = {}): ProductCreateInput => ({
  name: "Widget",
  category: "Hardware",
  priceCents: 1000,
  status: "active",
  unitsSold: 2,
  description: "",
  ...over,
});

const list = (query: Record<string, string> = {}) =>
  listProducts(productListQuerySchema.parse(query));

/** Follows nextCursor until exhausted; asserts the page size on the way. */
async function walk(query: Record<string, string>) {
  const pages: Product[][] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ ...query, ...(cursor ? { cursor } : {}) });
    pages.push(page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && pages.length < 50);
  return pages;
}

beforeEach(clearFirestore);

describe("create / read / update / delete", () => {
  it("stores derived fields and returns a clean DTO", async () => {
    const created = await createProduct(input({ name: "Acme Pro", priceCents: 2500, unitsSold: 4 }), ACTOR);
    expect(created).toMatchObject({ name: "Acme Pro", priceCents: 2500, unitsSold: 4, revenueCents: 10_000 });
    expect(created).not.toHaveProperty("nameLower");
    expect(created).not.toHaveProperty("createdBy");
    expect(await getProduct(created.id)).toEqual(created);
  });

  it("recomputes revenue on a partial update and keeps untouched fields", async () => {
    const { id } = await createProduct(input({ priceCents: 1000, unitsSold: 3, description: "keep me" }), ACTOR);
    const updated = await updateProduct(id, { priceCents: 2000 }, ACTOR);
    expect(updated).toMatchObject({ priceCents: 2000, unitsSold: 3, revenueCents: 6000, description: "keep me" });
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(updated!.createdAt).getTime());
  });

  it("keeps the search field in sync when the name changes", async () => {
    const { id } = await createProduct(input({ name: "Alpha" }), ACTOR);
    await updateProduct(id, { name: "Zulu" }, ACTOR);
    expect((await list({ q: "zu" })).items.map((p) => p.id)).toEqual([id]);
    expect((await list({ q: "al" })).items).toHaveLength(0);
  });

  it("returns null/false for missing products", async () => {
    expect(await getProduct("doesnotexist")).toBeNull();
    expect(await updateProduct("doesnotexist", { name: "x" }, ACTOR)).toBeNull();
    expect(await deleteProduct("doesnotexist")).toBe(false);
  });

  it("deletes", async () => {
    const { id } = await createProduct(input(), ACTOR);
    expect(await deleteProduct(id)).toBe(true);
    expect(await getProduct(id)).toBeNull();
  });
});

describe("listing", () => {
  // 23 products: prices repeat (ties) and names mix case.
  async function seed() {
    const names = ["alpha", "Bravo", "charlie", "Delta", "echo", "Foxtrot", "golf", "Hotel"];
    for (let i = 0; i < 23; i++) {
      await createProduct(
        input({
          name: `${names[i % names.length]} ${i}`,
          priceCents: ((i % 5) + 1) * 500, // only 5 distinct prices -> many ties
          category: i % 2 === 0 ? "Software" : "Hardware",
          status: i % 3 === 0 ? "inactive" : "active",
        }),
        ACTOR,
      );
    }
  }

  it("pages through everything exactly once, in order, for every sort and direction", async () => {
    await seed();
    for (const sort of ["createdAt", "price", "name"]) {
      for (const dir of ["asc", "desc"]) {
        const pages = await walk({ sort, dir, limit: "10" });
        expect(pages.map((p) => p.length), `${sort} ${dir}`).toEqual([10, 10, 3]);
        const all = pages.flat();
        expect(new Set(all.map((p) => p.id)).size, `${sort} ${dir} has duplicates`).toBe(23);

        const key = (p: Product) =>
          sort === "price" ? p.priceCents : sort === "name" ? p.name.toLowerCase() : p.createdAt;
        const sorted = [...all].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
        if (dir === "desc") sorted.reverse();
        // Ties are broken by id, so compare only the sort key sequence.
        expect(all.map(key), `${sort} ${dir} order`).toEqual(sorted.map(key));
      }
    }
  });

  it("returns no cursor when everything fits on one page", async () => {
    await createProduct(input(), ACTOR);
    expect((await list({ limit: "10" })).nextCursor).toBeNull();
  });

  it("returns no cursor when the last page is exactly full", async () => {
    for (let i = 0; i < 4; i++) await createProduct(input({ name: `p${i}` }), ACTOR);
    const page = await list({ limit: "4" });
    expect(page.items).toHaveLength(4);
    expect(page.nextCursor).toBeNull();
  });

  it("filters by status and category, combined with paging", async () => {
    await seed();
    const pages = await walk({ status: "active", category: "Software", limit: "3", sort: "price", dir: "asc" });
    const all = pages.flat();
    expect(all.length).toBeGreaterThan(3); // really spans several pages
    expect(all.every((p) => p.status === "active" && p.category === "Software")).toBe(true);
  });

  it("searches by case-insensitive name prefix, sorted by name", async () => {
    await seed();
    const result = await list({ q: "BRA" });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.every((p) => p.name.toLowerCase().startsWith("bra"))).toBe(true);
    expect((await list({ q: "nomatch" })).items).toEqual([]);
  });

  it("rejects a malformed cursor and a cursor from another sort order", async () => {
    await seed();
    await expect(list({ cursor: "garbage" })).rejects.toBeInstanceOf(ApiError);
    const byDate = await list({ limit: "5" });
    await expect(list({ sort: "price", cursor: byDate.nextCursor! })).rejects.toBeInstanceOf(ApiError);
  });
});

describe("metrics", () => {
  it("is all zeros / null for an empty catalogue", async () => {
    expect(await getMetrics()).toEqual({
      totalProducts: 0,
      activeProducts: 0,
      revenueCents: 0,
      averagePriceCents: null,
    });
  });

  it("aggregates inside Firestore", async () => {
    await createProduct(input({ priceCents: 1000, unitsSold: 2, status: "active" }), ACTOR); // 2000
    await createProduct(input({ priceCents: 3000, unitsSold: 1, status: "inactive" }), ACTOR); // 3000
    await createProduct(input({ priceCents: 500, unitsSold: 10, status: "active" }), ACTOR); // 5000
    expect(await getMetrics()).toEqual({
      totalProducts: 3,
      activeProducts: 2,
      revenueCents: 10_000,
      averagePriceCents: 1500,
    });
  });
});
