"use client";

import { formatCents } from "@/lib/format";
import type { Product, SortDirection, SortKey } from "@/lib/products/schema";
import { Badge, Button } from "./ui";

interface Props {
  items: Product[];
  sort: SortKey;
  dir: SortDirection;
  /** True while a text search is active: results are then fixed to name order. */
  sortLocked: boolean;
  canWrite: boolean;
  onSort: (key: SortKey) => void;
  onEdit: (product: Product) => void;
  onRecordSale: (product: Product) => void;
  onDelete: (product: Product) => void;
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function SortableHeader({
  label,
  sortKey,
  active,
  dir,
  disabled,
  onSort,
  className = "",
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  active: boolean;
  dir: SortDirection;
  disabled: boolean;
  onSort: (key: SortKey) => void;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    // aria-sort tells screen-reader users which column is sorted and how.
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        disabled={disabled}
        title={disabled && !active ? "Search results are sorted by name" : undefined}
        className="inline-flex items-center gap-1 uppercase hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:hover:text-slate-500"
      >
        {label}
        <span aria-hidden="true" className={active ? "text-slate-900" : "text-slate-300"}>
          {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function ProductTable({ items, sort, dir, sortLocked, canWrite, onSort, onEdit, onRecordSale, onDelete }: Props) {
  const header = (label: string, key: SortKey, extra?: { className?: string; align?: "left" | "right" }) => (
    <SortableHeader
      label={label}
      sortKey={key}
      active={sort === key}
      dir={dir}
      disabled={sortLocked && key !== "name"}
      onSort={onSort}
      {...extra}
    />
  );

  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <caption className="sr-only">Products. Column headers are buttons that change the sort order.</caption>
        <thead className="bg-slate-50">
          <tr>
            {header("Name", "name")}
            <th scope="col" className="hidden px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 sm:table-cell">
              Category
            </th>
            <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </th>
            {header("Price", "price", { align: "right" })}
            <th scope="col" className="hidden px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 lg:table-cell">
              Units sold
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 lg:table-cell">
              Revenue
            </th>
            {header("Added", "createdAt", { className: "hidden md:table-cell" })}
            {canWrite && (
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((product) => (
            <tr key={product.id} className="hover:bg-slate-50">
              <th scope="row" className="px-3 py-3 text-left text-sm font-medium text-slate-900">
                {product.name}
                {product.description && (
                  <span className="mt-0.5 line-clamp-1 block max-w-md text-xs font-normal text-slate-500">
                    {product.description}
                  </span>
                )}
                {/* Category is hidden as a column on phones, so show it under the name there. */}
                <span className="block text-xs font-normal text-slate-500 sm:hidden">{product.category}</span>
              </th>
              <td className="hidden px-3 py-3 text-sm text-slate-600 sm:table-cell">{product.category}</td>
              <td className="px-3 py-3 text-sm">
                <Badge tone={product.status === "active" ? "green" : "gray"}>{product.status}</Badge>
              </td>
              <td className="px-3 py-3 text-right text-sm tabular-nums text-slate-900">{formatCents(product.priceCents)}</td>
              <td className="hidden px-3 py-3 text-right text-sm tabular-nums text-slate-600 lg:table-cell">
                {product.unitsSold.toLocaleString("en-US")}
              </td>
              <td className="hidden px-3 py-3 text-right text-sm tabular-nums text-slate-600 lg:table-cell">
                {formatCents(product.revenueCents)}
              </td>
              <td className="hidden px-3 py-3 text-sm text-slate-600 md:table-cell">
                <time dateTime={product.createdAt}>{dateFormat.format(new Date(product.createdAt))}</time>
              </td>
              {canWrite && (
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => onEdit(product)} aria-label={`Edit ${product.name}`}>
                      Edit
                    </Button>
                    <Button variant="secondary" onClick={() => onRecordSale(product)} aria-label={`Add units sold for ${product.name}`}>
                      Add units sold
                    </Button>
                    <Button variant="danger" onClick={() => onDelete(product)} aria-label={`Delete ${product.name}`}>
                      Delete
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
