# Database design

Firestore holds two collections, `products` and `sales`. Users and roles live in **Firebase Auth**, not in Firestore (see [Where users live](#where-users-live)).

All access goes through the Next.js API using the Admin SDK. `firestore.rules` denies every direct client read and write, so the data model is only reachable through code that checks the session and role first.

## At a glance

```
(Firestore root)
├── products/{productId}     one document per product, including running sales totals
└── sales/{saleId}           one document per recorded sale; productId points back to the product

(Firebase Auth)
└── users                    identity + role custom claim { role: "admin" }; no Firestore copy
```

**Subcollections: none, deliberately.**

- **Sales are a top-level collection, not `products/{id}/sales`.** A product can be hard-deleted, and a subcollection is not deleted with its parent but becomes orphaned and awkward to query. A top-level collection keeps every sale reachable after the product is gone. It also lets the revenue metric be one `sum(amountCents)` over `sales`, rather than a collection-group query.
- **Users are not in Firestore at all** (see [Where users live](#where-users-live)).
- Subcollections do appear in the [multi-tenancy plan](#multi-tenancy), where nesting under `orgs/{orgId}` gives tenant isolation by construction.

An example `products` document, as stored:

```json
{
  "name": "Sourdough Loaf",
  "nameLower": "sourdough loaf",
  "category": "Bread",
  "priceCents": 650,
  "status": "active",
  "description": "",
  "unitsSold": 12,
  "revenueCents": 7800,
  "createdAt": "<Timestamp>",
  "updatedAt": "<Timestamp>",
  "createdBy": "<uid>",
  "updatedBy": "<uid>"
}
```

| The brief asks for | Where it is answered |
|---|---|
| Collections, documents, fields, subcollections | This section, [`products`](#productsproductid), [`sales`](#salessaleid), [Where users live](#where-users-live) |
| Indexing strategy | [Queries and indexes](#queries-and-indexes) |
| Multi-tenancy | [Multi-tenancy](#multi-tenancy) |
| 10× the number of products | [Scaling to 10x and beyond](#scaling-to-10x-and-beyond) |

## `products/{productId}`

The document id is a Firestore auto-id (20 alphanumeric characters).

| Field | Type | Set by | Notes |
|---|---|---|---|
| `name` | string (1-120) | client | Display name. |
| `category` | string enum | client | `Bread`, `Pastries`, `Cakes`, `Cookies`, `Drinks`, `Other`. |
| `priceCents` | integer (0 to 10,000,000) | client | **Integer cents**, never a float, so sums are exact. |
| `status` | `"active"` \| `"inactive"` | client | |
| `description` | string (0-1000) | client / AI draft | Optional. |
| `nameLower` | string | **server** | `name.toLowerCase()`. Backs case-insensitive search and name sorting. |
| `unitsSold` | integer (0 to 10,000,000) | **server** | Running total of this product's sales. Starts at 0. |
| `revenueCents` | integer | **server** | Running total of this product's sales, each at the price it sold for. Not `priceCents * unitsSold`. |
| `createdAt` | Timestamp | **server** | Application clock (ms precision), so the API can return stored values without a second read. |
| `updatedAt` | Timestamp | **server** | |
| `createdBy`, `updatedBy` | string (uid) | **server** | Audit trail. |

"Set by server" fields are derived in one place (`lib/products/repository.ts`) and the API schema is `strict`, so a client sending `unitsSold`, `revenueCents` or `createdBy` gets a 400.

**Denormalisation trade-off.** `nameLower` is a copy of `name`, and `unitsSold` / `revenueCents` are totals of the product's `sales`. Recording a sale writes the sale and the new totals in one **transaction**, so concurrent sales cannot overwrite each other and the totals always equal the sum of the sales. The price of this is that nothing may write to `products` or `sales` except the repository. The payoff is that search, name sorting and the per-product totals need no extra reads.

## `sales/{saleId}`

One document per recorded sale, written only by `recordSale()` (`POST /api/products/{id}/sales`). Sales are never edited.

| Field | Type | Notes |
|---|---|---|
| `productId` | string | The product that sold. Not a subcollection, so the sale survives the product being hard-deleted. |
| `quantity` | integer (1 to 10,000,000) | Positive only. |
| `unitPriceCents` | integer | The product's `priceCents` **at the time of sale**. |
| `amountCents` | integer | `quantity * unitPriceCents`. Backs the revenue metric. |
| `createdAt` | Timestamp | |
| `createdBy` | string (uid) | |

**Why sales are recorded separately.** Storing revenue as `priceCents * unitsSold` would restate history: raising a price would raise the revenue of every unit already sold, and deleting a product would remove its revenue. Capturing the price on each sale makes a price edit apply to future sales only, and summing revenue from `sales` keeps the sales of deleted products.

**Refunds are not supported yet.** A refund must reverse a specific sale at the price it was sold for, so it needs a "void sale" operation that writes a negative entry referencing the original. Subtracting units at today's price would make revenue wrong, which is why `quantity` must be positive.

### Where users live

Firebase Auth is the source of truth for identity **and** role: the role is a custom claim, `{ role: "admin" }`. There is deliberately no `users` collection, because a second copy of the role could disagree with the one that actually grants access. A missing or unrecognised claim means `viewer`, so only admins are stored. Listing users for the admin page uses `auth.listUsers()`.

If per-user profile data is added later (display name, preferences), it belongs in `users/{uid}` and must **not** contain the role.

## Queries and indexes

Every list request becomes one query (`lib/products/queryPlan.ts`): optional equality filters on `category` and `status`, an optional name-prefix range, one `orderBy`, a document-id tie-breaker, and `limit(n + 1)`.

| Query shape | Index needed |
|---|---|
| No filters, sorted by `createdAt`, `priceCents` or `nameLower` (either direction) | None: Firestore's automatic single-field indexes. |
| Name search (prefix range on `nameLower`) with no other filter | None: single-field. |
| Any combination of `category` / `status` filters, with any sort and direction, with or without search | One of **18 composite indexes**: (filters...) + (sort field, direction). |
| Metrics (`count`, `average(priceCents)`, `count where status == active` on `products`; `sum(amountCents)` on `sales`) | Served from existing single-field indexes. |

The 18 = 3 filter combinations (`category`, `status`, both) x 3 sort fields x 2 directions.

**How we keep indexes honest.** `firestore.indexes.json` is **generated** from the same code that builds queries (`npm run indexes:generate`). A test enumerates every filter, sort, direction and search combination the API accepts and fails if one has no matching index, and another test fails if the committed file is out of date. This matters because **the Firebase emulator does not enforce indexes**: a missing index would pass every local test and fail in production with `FAILED_PRECONDITION`.

**Indexes we turned off.** On `products`, `description`, `unitsSold`, `revenueCents`, `updatedAt`, `createdBy` and `updatedBy` are never filtered, sorted or aggregated on; on `sales`, neither are `quantity`, `unitPriceCents` and `createdBy`. Their automatic single-field indexes are disabled (`fieldOverrides`). That removes six index writes from every product write and keeps the 1,000-character description out of an index. Re-enable one in `UNINDEXED_FIELDS` if a query ever needs it. `products.priceCents` and `sales.amountCents` stay indexed because `average()` and `sum()` are computed from indexes. `sales.productId` and `sales.createdAt` stay indexed for a future per-product sales history.

Deploy rules and indexes with:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### Search

Search is a **case-insensitive prefix match** on the name: `nameLower >= q AND nameLower <= q + "\uf8ff"`. Firestore only allows a range filter on the field of the first `orderBy`, so an active search always sorts by name. The UI says so and disables the other sort buttons while a search is active, rather than silently ignoring the user's choice.

This is not full-text search ("pro" will not find "Aurora Analytics Pro"). See [Scaling](#scaling-to-10x-and-beyond) for the next step.

### Pagination

Cursor-based. The cursor encodes the last item's sort value and document id; the next request uses `startAfter(value, id)`. Every page costs the same regardless of depth, unlike offset pagination, which re-reads (and bills) every skipped document. The id tie-breaker keeps pages stable when many products share a price or name. Timestamps are encoded as `[seconds, nanoseconds]` so no precision is lost between pages. The API fetches `limit + 1` documents to know whether another page exists without a separate count query.

## Evolving the schema

### Multi-tenancy

**Recommended: nest products under the tenant.** `orgs/{orgId}/products/{productId}`.

- **Isolation by construction.** A query rooted at `orgs/{orgId}/products` cannot return another tenant's data, whatever filters a bug builds. Compare with a shared collection, where one forgotten `where("orgId", "==", ...)` leaks everything.
- **Indexes should keep working.** Composite indexes are defined by collection *id*, so the same 18 definitions should cover every tenant's `products` subcollection (a shared collection would instead prefix all 18 with `orgId`). The emulator cannot confirm this, so it would need checking against a staging project.
- **Operations get easier.** Deleting a tenant is `recursiveDelete`; per-tenant export is a path.
- **Cross-tenant analytics** (internal only) use a collection-group query, which needs a separate `COLLECTION_GROUP` index.

Changes needed:
1. `orgId` becomes an argument of every repository function, taken from the **verified session**, never from the request body or URL.
2. Membership: `{ role }` becomes per-org. For a handful of orgs per user, a claim like `{ orgs: { acme: "admin" } }` works (custom claims are limited to 1,000 bytes). Beyond that, store `orgs/{orgId}/members/{uid} -> { role }` and read it in `getSessionUser`.
3. `firestore.rules` stays deny-all.
4. A one-off migration copies `products/*` into `orgs/{defaultOrg}/products/*`.

The alternative, a top-level `products` collection with an `orgId` field, is simpler to query across tenants but pays for it in leak risk and index size. I would only choose it if cross-tenant queries were the main use case.

### Scaling to 10x and beyond

| Pressure | What happens | What to do |
|---|---|---|
| **List reads** | Already bounded: pages are `limit + 1` reads whatever the collection size. | Nothing at 10x. |
| **Metrics** | Aggregations are billed per 1,000 index entries scanned, so cost and latency grow linearly with the collection. `sales` grows much faster than `products`, so the revenue sum hits this first. Fine to roughly 10^5 to 10^6 documents. | Maintain a `stats/{orgId}` document updated in the same transaction as each write (or a sharded counter if one document becomes a write hotspot, since a single document sustains about 1 write per second), and cache the result for a few seconds. |
| **Search** | Prefix-only. | Sync to a search service (Typesense, Algolia, or Elasticsearch) from a Firestore trigger, and keep Firestore as the source of truth. |
| **Write cost** | Every write updates the document plus its index entries. | Already trimmed with `fieldOverrides`. Audit unused composite indexes before adding more. |
| **Hotspots** | `createdAt` is monotonically increasing, which concentrates index writes on one key range at sustained high write rates (hundreds per second). | Not a concern for this workload. If it becomes one, bucket by time prefix or use a non-sequential sort key. |
| **Category filter** | A fixed enum in code. | Move to a `categories` collection per tenant. The filters and indexes are unchanged; only validation and the dropdown source change. |
| **Hard deletes** | No history. | Soft-delete (`deletedAt`) plus a retention job; `status: inactive` already covers "hide but keep". |
