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
import type {
  Metrics,
  Product,
  ProductCreateInput,
  ProductListParams,
  ProductPage,
  ProductUpdateInput,
} from "./schema.ts";

const COLLECTION = "products";
const products = () => db.collection(COLLECTION);

/** Fields that are derived on every write, never accepted from a client. */
function derivedFields(name: string, priceCents: number, unitsSold: number) {
  return {
    // Lower-cased copy: Firestore has no case-insensitive search or sort, so
    // search (prefix match) and "sort by name" both run against this field.
    nameLower: name.toLowerCase(),
    // Denormalised so the revenue metric is a server-side sum() aggregation
    // (one index scan) instead of reading every product into memory.
    revenueCents: priceCents * unitsSold,
  };
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
    ...derivedFields(input.name, input.priceCents, input.unitsSold),
    createdAt: now,
    updatedAt: now,
    createdBy: actorUid,
    updatedBy: actorUid,
  };
  await ref.create(data); // create() fails if the id somehow exists, never overwrites
  return toProduct(ref.id, data);
}

/** Partial update. Runs in a transaction because revenueCents depends on the stored price and units. */
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

    const name = patch.name ?? current.name;
    const priceCents = patch.priceCents ?? current.priceCents;
    const unitsSold = patch.unitsSold ?? current.unitsSold;
    const update = {
      ...patch,
      ...derivedFields(name, priceCents, unitsSold),
      updatedAt: Timestamp.now(),
      updatedBy: actorUid,
    };
    tx.update(ref, update);
    return toProduct(id, { ...current, ...update });
  });
}

/** Hard delete. Returns false if the product did not exist. */
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
 */
export async function getMetrics(): Promise<Metrics> {
  const [all, active] = await Promise.all([
    products()
      .aggregate({
        total: AggregateField.count(),
        revenue: AggregateField.sum("revenueCents"),
        averagePrice: AggregateField.average("priceCents"),
      })
      .get(),
    products().where("status", "==", "active").count().get(),
  ]);
  const totals = all.data();
  return {
    totalProducts: totals.total,
    activeProducts: active.data().count,
    revenueCents: totals.revenue,
    averagePriceCents: totals.averagePrice === null ? null : Math.round(totals.averagePrice),
  };
}
