// Data access layer for products. This is the only module that knows the
// Firestore shape of a product; routes and UI only ever see the `Product` DTO.
import "server-only";
import {
  AggregateField,
  FieldPath,
  Timestamp,
  type DocumentData,
  type Query,
} from "firebase-admin/firestore";
import { ApiError } from "../api/errors.ts";
import { db } from "../firebase/admin.ts";
import {
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  type Cursor,
  type OrderField,
} from "./cursor.ts";
import { planListQuery } from "./queryPlan.ts";
import {
  MAX_UNITS_SOLD,
  type Metrics,
  type Product,
  type ProductCreateInput,
  type ProductListParams,
  type ProductPage,
  type ProductUpdateInput,
  type Sale,
  type SaleCreateInput,
} from "./schema.ts";

const products = () => db.collection("products");
// Top-level rather than a subcollection of the product, so a sale (and the
// revenue it represents) outlives a hard-deleted product.
const sales = () => db.collection("sales");

/** Derived from the name on every write, never accepted from a client. */
function nameFields(name: string) {
  // Lower-cased copy: Firestore has no case-insensitive search or sort, so
  // search (prefix match) and "sort by name" both run against this field.
  return { nameLower: name.toLowerCase() };
}

function toProduct(id: string, data: DocumentData): Product {
  return {
    id,
    name: data.name,
    category: data.category,
    priceCents: data.priceCents,
    status: data.status,
    unitsSold: data.unitsSold,
    revenueCents: data.revenueCents,
    description: data.description ?? "",
    createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
    updatedAt: (data.updatedAt as Timestamp).toDate().toISOString(),
  };
}

function cursorFor(field: OrderField, data: DocumentData, id: string): Cursor {
  switch (field) {
    case "createdAt": {
      const ts = data.createdAt as Timestamp;
      return { f: "createdAt", v: [ts.seconds, ts.nanoseconds], id };
    }
    case "priceCents":
      return { f: "priceCents", v: data.priceCents, id };
    case "nameLower":
      return { f: "nameLower", v: data.nameLower, id };
  }
}

function startAfterValues(cursor: Cursor): [string | number | Timestamp, string] {
  return [
    cursor.f === "createdAt" ? new Timestamp(cursor.v[0], cursor.v[1]) : cursor.v,
    cursor.id,
  ];
}

export async function listProducts(params: ProductListParams): Promise<ProductPage> {
  const plan = planListQuery(params);

  let query: Query = products();
  for (const { field, value } of plan.equality) query = query.where(field, "==", value);
  if (plan.prefix) {
    // "\uf8ff" is a very high code point: [prefix, prefix+\uf8ff] matches every string
    // that starts with the prefix.
    query = query
      .where("nameLower", ">=", plan.prefix)
      .where("nameLower", "<=", plan.prefix + "\uf8ff");
  }
  // The explicit documentId() tie-breaker has the same direction as the sort, which
  // is what Firestore appends implicitly, so the same composite index serves it.
  query = query.orderBy(plan.orderField, plan.dir).orderBy(FieldPath.documentId(), plan.dir);

  if (params.cursor) {
    try {
      query = query.startAfter(...startAfterValues(decodeCursor(params.cursor, plan.orderField)));
    } catch (error) {
      if (error instanceof InvalidCursorError) throw new ApiError("bad_request", error.message);
      throw error;
    }
  }

  // Fetch one extra document: if it exists there is another page, and we avoid a
  // separate count query. The extra document is not returned.
  const snapshot = await query.limit(params.limit + 1).get();
  const page = snapshot.docs.slice(0, params.limit);
  const last = page.at(-1);

  return {
    items: page.map((doc) => toProduct(doc.id, doc.data())),
    nextCursor:
      snapshot.docs.length > params.limit && last
        ? encodeCursor(cursorFor(plan.orderField, last.data(), last.id))
        : null,
  };
}

export async function getProduct(id: string): Promise<Product | null> {
  const snap = await products().doc(id).get();
  return snap.exists ? toProduct(snap.id, snap.data()!) : null;
}

export async function createProduct(
  input: ProductCreateInput,
  actorUid: string,
  // Only the seed script passes this (to spread demo data over time). API routes
  // never do, so clients cannot choose their own creation date.
  options: { createdAt?: Date } = {},
): Promise<Product> {
  const ref = products().doc();
  // Timestamp.now() (app clock, millisecond precision) instead of a server
  // timestamp, so we can return the stored values without a second read.
  const now = options.createdAt ? Timestamp.fromDate(options.createdAt) : Timestamp.now();
  const data = {
    ...input,
    ...nameFields(input.name),
    unitsSold: 0,
    revenueCents: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: actorUid,
    updatedBy: actorUid,
  };
  await ref.create(data); // create() fails if the id somehow exists, never overwrites
  return toProduct(ref.id, data);
}

/**
 * Partial update. A price change applies to future sales only: unitsSold and
 * revenueCents are not editable here. Runs in a transaction so the returned
 * product is exactly what is stored, even if a sale is recorded concurrently.
 */
export async function updateProduct(
  id: string,
  patch: ProductUpdateInput,
  actorUid: string,
): Promise<Product | null> {
  const ref = products().doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const current = snap.data()!;

    const update = {
      ...patch,
      ...(patch.name === undefined ? {} : nameFields(patch.name)),
      updatedAt: Timestamp.now(),
      updatedBy: actorUid,
    };
    tx.update(ref, update);
    return toProduct(id, { ...current, ...update });
  });
}

/**
 * Records a sale at the product's current price and adds it to the product's
 * running totals. One transaction, so concurrent sales are never lost and the
 * totals always equal the sum of the product's sales.
 */
export async function recordSale(
  productId: string,
  input: SaleCreateInput,
  actorUid: string,
  // Only the seed script passes this, like createProduct.
  options: { createdAt?: Date } = {},
): Promise<{ sale: Sale; product: Product } | null> {
  const productRef = products().doc(productId);
  const saleRef = sales().doc();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(productRef);
    if (!snap.exists) return null;
    const current = snap.data()!;

    const unitsSold = current.unitsSold + input.quantity;
    if (unitsSold > MAX_UNITS_SOLD) {
      throw new ApiError("bad_request", `A product cannot exceed ${MAX_UNITS_SOLD.toLocaleString("en-US")} units sold`);
    }
    const now = options.createdAt ? Timestamp.fromDate(options.createdAt) : Timestamp.now();
    const amountCents = input.quantity * current.priceCents;
    const saleData = {
      productId,
      quantity: input.quantity,
      unitPriceCents: current.priceCents,
      amountCents,
      createdAt: now,
      createdBy: actorUid,
    };
    const update = {
      unitsSold,
      revenueCents: current.revenueCents + amountCents,
      updatedAt: now,
      updatedBy: actorUid,
    };
    tx.create(saleRef, saleData);
    tx.update(productRef, update);
    return {
      sale: {
        id: saleRef.id,
        productId,
        quantity: saleData.quantity,
        unitPriceCents: saleData.unitPriceCents,
        amountCents,
        createdAt: now.toDate().toISOString(),
      },
      product: toProduct(productId, { ...current, ...update }),
    };
  });
}

/** Hard delete. Returns false if the product did not exist. Its sales are kept, so revenue is not restated. */
export async function deleteProduct(id: string): Promise<boolean> {
  const ref = products().doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.delete(ref);
    return true;
  });
}

/**
 * Dashboard metrics via Firestore aggregation queries: the work happens inside
 * Firestore and we are billed per 1,000 index entries scanned, not per document
 * read, so this stays fast and cheap as the collection grows.
 *
 * Revenue is summed from the sales, not the products, so it includes sales of
 * products that were deleted since.
 */
export async function getMetrics(): Promise<Metrics> {
  const [all, active, revenue] = await Promise.all([
    products()
      .aggregate({
        total: AggregateField.count(),
        averagePrice: AggregateField.average("priceCents"),
      })
      .get(),
    products().where("status", "==", "active").count().get(),
    sales().aggregate({ total: AggregateField.sum("amountCents") }).get(),
  ]);
  const totals = all.data();
  return {
    totalProducts: totals.total,
    activeProducts: active.data().count,
    revenueCents: revenue.data().total,
    averagePriceCents: totals.averagePrice === null ? null : Math.round(totals.averagePrice),
  };
}
