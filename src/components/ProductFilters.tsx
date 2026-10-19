"use client";

import type { ProductFilters as Filters } from "@/hooks/useProducts";
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from "@/lib/products/schema";
import { Field, inputClass, selectClass } from "./ui";

export function ProductFilters({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }) {
  return (
    <form
      role="search"
      aria-label="Filter products"
      onSubmit={(e) => e.preventDefault()}
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <Field id="filter-q" label="Search by name" hint="Matches the start of the name">
        {(aria) => (
          <input
            {...aria}
            type="search"
            value={filters.q}
            maxLength={60}
            onChange={(e) => onChange({ ...filters, q: e.target.value })}
            className={inputClass}
          />
        )}
      </Field>
      <Field id="filter-status" label="Status">
        {(aria) => (
          <select
            {...aria}
            value={filters.status}
            onChange={(e) => onChange({ ...filters, status: e.target.value as Filters["status"] })}
            className={selectClass}
          >
            <option value="">All statuses</option>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id="filter-category" label="Category">
        {(aria) => (
          <select
            {...aria}
            value={filters.category}
            onChange={(e) => onChange({ ...filters, category: e.target.value as Filters["category"] })}
            className={selectClass}
          >
            <option value="">All categories</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </Field>
    </form>
  );
}
