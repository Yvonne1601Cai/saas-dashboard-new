// A pure description of the Firestore query a list request turns into.
//
// Keeping this separate from the repository has two payoffs:
//  1. the rules Firestore imposes (see planListQuery) live in one place, and
//  2. requiredIndexes() derives the composite indexes from the very same rules,
//     and a test compares them with firestore.indexes.json. The emulator does NOT
//     enforce indexes, so without that test a missing index would only show up in
//     production as a FAILED_PRECONDITION error.
import type { OrderField } from "./cursor.ts";
import type { ProductListParams, SortDirection, SortKey } from "./schema.ts";

export type EqualityField = "category" | "status";

export interface QueryPlan {
  equality: Array<{ field: EqualityField; value: string }>;
  /** Lower-cased name prefix for the search box, if any. */
  prefix?: string;
  orderField: OrderField;
  dir: SortDirection;
}

const ORDER_FIELD: Record<SortKey, OrderField> = {
  createdAt: "createdAt",
  price: "priceCents",
  name: "nameLower",
};

export function normalizeSearch(q: string | undefined): string | undefined {
  const normalized = q?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export function planListQuery(params: ProductListParams): QueryPlan {
  const prefix = normalizeSearch(params.q);
  const equality: QueryPlan["equality"] = [];
  // Alphabetical so the plan (and the index definition) is deterministic.
  if (params.category) equality.push({ field: "category", value: params.category });
  if (params.status) equality.push({ field: "status", value: params.status });

  return {
    equality,
    prefix,
    // Firestore only allows a range filter (our prefix search) on the field of the
    // first orderBy, so an active text search always sorts by name. The UI shows
    // this to the user rather than silently ignoring their chosen sort.
    orderField: prefix ? "nameLower" : ORDER_FIELD[params.sort],
    dir: params.dir,
  };
}

export interface IndexDefinition {
  collectionGroup: string;
  queryScope: "COLLECTION";
  fields: Array<{ fieldPath: string; order: "ASCENDING" | "DESCENDING" }>;
}

/**
 * Firestore indexes every field automatically, and each index is extra work on
 * every write plus storage. These fields are never filtered or sorted on, so their
 * automatic indexes are switched off. Re-enable one here if a query ever needs it.
 * (priceCents, status, category, the sort fields and sales.amountCents stay
 * indexed: queries and sum()/average() aggregations depend on them.)
 */
export const UNINDEXED_FIELDS = {
  products: ["description", "unitsSold", "revenueCents", "updatedAt", "createdBy", "updatedBy"],
  sales: ["quantity", "unitPriceCents", "createdBy"],
} as const;

export function fieldOverrides() {
  return Object.entries(UNINDEXED_FIELDS).flatMap(([collectionGroup, fields]) =>
    fields.map((fieldPath) => ({ collectionGroup, fieldPath, indexes: [] })),
  );
}

const EQUALITY_COMBINATIONS: EqualityField[][] = [
  ["category"],
  ["status"],
  ["category", "status"],
];
const ORDER_FIELDS: OrderField[] = ["createdAt", "nameLower", "priceCents"];

/**
 * Every composite index the API can need. Queries with no equality filter are
 * served by Firestore's automatic single-field indexes, so only filtered queries
 * appear here. Both directions are listed explicitly rather than relying on
 * reverse index scans, which keeps the file easy to reason about.
 */
export function requiredIndexes(): IndexDefinition[] {
  const indexes: IndexDefinition[] = [];
  for (const equality of EQUALITY_COMBINATIONS) {
    for (const orderField of ORDER_FIELDS) {
      for (const order of ["ASCENDING", "DESCENDING"] as const) {
        indexes.push({
          collectionGroup: "products",
          queryScope: "COLLECTION",
          fields: [
            ...equality.map((fieldPath) => ({ fieldPath, order: "ASCENDING" as const })),
            { fieldPath: orderField, order },
          ],
        });
      }
    }
  }
  return indexes;
}
