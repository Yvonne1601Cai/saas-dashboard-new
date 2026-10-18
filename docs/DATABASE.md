# Database design

Firestore holds one collection, `products`. Users and roles live in **Firebase Auth**, not in Firestore (see [Where users live](#where-users-live)).

All access goes through the Next.js API using the Admin SDK. `firestore.rules` denies every direct client read and write, so the data model is only reachable through code that checks the session and role first.

## `products/{productId}`

The document id is a Firestore auto-id (20 alphanumeric characters).

| Field | Type | Set by | Notes |
|---|---|---|---|
| `name` | string (1-120) | client | Display name. |
| `category` | string enum | client | `Software`, `Hardware`, `Services`, `Subscriptions`, `Other`. |
| `priceCents` | integer (0 to 10,000,000) | client | **Integer cents**, never a float, so sums are exact. |
| `status` | `"active"` \| `"inactive"` | client | |
| `unitsSold` | integer (0 to 10,000,000) | client | Needed to give "revenue" a meaning. |
| `description` | string (0-1000) | client / AI draft | Optional. |
| `nameLower` | string | **server** | `name.toLowerCase()`. Backs case-insensitive search and name sorting. |
| `revenueCents` | integer | **server** | `priceCents * unitsSold`. Backs the revenue metric. |
| `createdAt` | Timestamp | **server** | Application clock (ms precision), so the API can return stored values without a second read. |
| `updatedAt` | Timestamp | **server** | |
| `createdBy`, `updatedBy` | string (uid) | **server** | Audit trail. |

"Set by server" fields are derived in one place (`lib/products/repository.ts`) and the API schema is `strict`, so a client sending `revenueCents` or `createdBy` gets a 400.

**Denormalisation trade-off.** `nameLower` and `revenueCents` are copies that must change whenever `name`, `priceCents` or `unitsSold` change. Updates therefore run in a **transaction** (read, recompute, write). The price of this is that nothing may write to `products` except the repository. The payoff is that search, name sorting and the revenue metric need no full-collection reads.

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
| Metrics (`count`, `sum(revenueCents)`, `average(priceCents)`, `count where status == active`) | Served from existing single-field indexes. |

The 18 = 3 filter combinations (`category`, `status`, both) x 3 sort fields x 2 directions.

**How we keep indexes honest.** `firestore.indexes.json` is **generated** from the same code that builds queries (`npm run indexes:generate`). A test enumerates every filter, sort, direction and search combination the API accepts and fails if one has no matching index, and another test fails if the committed file is out of date. This matters because **the Firebase emulator does not enforce indexes**: a missing index would pass every local test and fail in production with `FAILED_PRECONDITION`.

**Indexes we turned off.** `description`, `unitsSold`, `updatedAt`, `createdBy` and `updatedBy` are never filtered or sorted on, so their automatic single-field indexes are disabled (`fieldOverrides`). That removes five index writes from every product write and keeps the 1,000-character description out of an index. Re-enable one in `UNINDEXED_FIELDS` if a query ever needs it. `priceCents` and `revenueCents` stay indexed because `sum()` and `average()` are computed from indexes.

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
| **Metrics** | Aggregations are billed per 1,000 index entries scanned, so cost and latency grow linearly with the collection. Fine to roughly 10^5 to 10^6 documents. | Maintain a `stats/{orgId}` document updated in the same transaction as each write (or a sharded counter if one document becomes a write hotspot, since a single document sustains about 1 write per second), and cache the result for a few seconds. |
| **Search** | Prefix-only. | Sync to a search service (Typesense, Algolia, or Elasticsearch) from a Firestore trigger, and keep Firestore as the source of truth. |
| **Write cost** | Every write updates the document plus its index entries. | Already trimmed with `fieldOverrides`. Audit unused composite indexes before adding more. |
| **Hotspots** | `createdAt` is monotonically increasing, which concentrates index writes on one key range at sustained high write rates (hundreds per second). | Not a concern for this workload. If it becomes one, bucket by time prefix or use a non-sequential sort key. |
| **Category filter** | A fixed enum in code. | Move to a `categories` collection per tenant. The filters and indexes are unchanged; only validation and the dropdown source change. |
| **Hard deletes** | No history. | Soft-delete (`deletedAt`) plus a retention job; `status: inactive` already covers "hide but keep". |
