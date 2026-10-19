"use client";

import { useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { DEFAULT_FILTERS, PAGE_SIZE, useProducts, type ProductFilters as Filters } from "@/hooks/useProducts";
import { can, type Role } from "@/lib/auth/roles";
import type { Product, SortKey } from "@/lib/products/schema";
import { DeleteDialog } from "./DeleteDialog";
import { MetricCards } from "./MetricCards";
import { ProductDialog } from "./ProductDialog";
import { ProductFilters } from "./ProductFilters";
import { ProductTable } from "./ProductTable";
import { RecordSaleDialog } from "./RecordSaleDialog";
import { Button } from "./ui";

// First click on a column picks the direction people usually want for it.
const DEFAULT_DIR = { createdAt: "desc", price: "asc", name: "asc" } as const;

export function Dashboard({ role }: { role: Role }) {
  // Hiding controls is a courtesy to viewers. The API enforces the same rule
  // (lib/auth/roles.ts is shared), so a viewer who calls it directly gets a 403.
  const canWrite = can(role, "product:write");

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  // Debounce only what hits the server; the input itself stays instantly responsive.
  const debouncedQ = useDebouncedValue(filters.q, 300);
  const searching = debouncedQ.trim().length > 0;
  // While searching the server sorts by name (a Firestore range-filter rule). If the
  // user was sorted by something else, start the name order A-Z rather than inheriting
  // e.g. "newest first" as Z-A. Once they are sorted by name their direction is kept.
  const effective: Pick<Filters, "sort" | "dir"> =
    searching && filters.sort !== "name" ? { sort: "name", dir: "asc" } : { sort: filters.sort, dir: filters.dir };
  const queryFilters: Filters = { ...filters, ...effective, q: debouncedQ };
  const shownSort: SortKey = effective.sort;

  const products = useProducts(queryFilters);
  const items = products.data?.pages.flatMap((page) => page.items) ?? [];

  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [selling, setSelling] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  function onSort(key: SortKey) {
    setFilters((f) =>
      key === effective.sort
        ? { ...f, sort: key, dir: effective.dir === "asc" ? "desc" : "asc" }
        : { ...f, sort: key, dir: DEFAULT_DIR[key] },
    );
  }

  const filtered = searching || filters.status !== "" || filters.category !== "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
          {!canWrite && <p className="text-sm text-slate-600">You have read-only access.</p>}
        </div>
        {canWrite && <Button onClick={() => setEditing("new")}>Add product</Button>}
      </div>

      <MetricCards />

      <ProductFilters filters={filters} onChange={setFilters} />

      <section aria-label="Product list" aria-busy={products.isFetching}>
        {products.isPending ? (
          <div className="space-y-2" role="status" aria-label="Loading products">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : products.isError ? (
          <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
            Could not load products.{" "}
            <button className="font-medium underline" onClick={() => products.refetch()}>
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg bg-white p-10 text-center ring-1 ring-slate-200">
            <p className="font-medium text-slate-900">{filtered ? "No products match these filters" : "No products yet"}</p>
            <p className="mt-1 text-sm text-slate-600">
              {filtered
                ? "Try clearing the search or filters."
                : canWrite
                  ? "Add your first product to get started."
                  : "An admin has not added any products yet."}
            </p>
            {filtered && (
              <Button variant="secondary" className="mt-4" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <ProductTable
              items={items}
              sort={shownSort}
              dir={effective.dir}
              sortLocked={searching}
              canWrite={canWrite}
              onSort={onSort}
              onEdit={setEditing}
              onRecordSale={setSelling}
              onDelete={setDeleting}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="text-sm text-slate-600">
                Showing {items.length} product{items.length === 1 ? "" : "s"}
                {products.hasNextPage ? "" : " (all)"}
              </p>
              {products.hasNextPage && (
                <Button variant="secondary" onClick={() => products.fetchNextPage()} disabled={products.isFetchingNextPage}>
                  {products.isFetchingNextPage ? "Loading…" : `Load ${PAGE_SIZE} more`}
                </Button>
              )}
            </div>
            {products.isFetchNextPageError && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                Could not load more products.
              </p>
            )}
          </>
        )}
      </section>

      {/* Dialogs mount only while open, so their form state starts fresh each time. */}
      {canWrite && editing && (
        <ProductDialog product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
      {canWrite && selling && <RecordSaleDialog product={selling} onClose={() => setSelling(null)} />}
      {canWrite && deleting && <DeleteDialog product={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
