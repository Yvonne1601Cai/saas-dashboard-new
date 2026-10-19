"use client";

import { useMetrics } from "@/hooks/useProducts";
import { formatCents } from "@/lib/format";

export function MetricCards() {
  const { data, isPending, isError } = useMetrics();

  const cards = [
    { label: "Total products", value: data?.totalProducts.toLocaleString("en-US") },
    {
      label: "Active products",
      value: data?.activeProducts.toLocaleString("en-US"),
      sub: data && data.totalProducts > 0 ? `${Math.round((data.activeProducts / data.totalProducts) * 100)}% of catalogue` : undefined,
    },
    { label: "Revenue (recorded sales)", value: data && formatCents(data.revenueCents) },
    {
      label: "Average price",
      value: data && (data.averagePriceCents === null ? "n/a" : formatCents(data.averagePriceCents)),
    },
  ];

  return (
    <section aria-label="Summary metrics">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <dt className="text-sm text-slate-500">{card.label}</dt>
            <dd className="mt-1 text-2xl font-semibold text-slate-900">
              {isError ? "–" : isPending ? <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-200" aria-label="Loading" /> : card.value}
            </dd>
            {card.sub && !isPending && <dd className="text-xs text-slate-500">{card.sub}</dd>}
          </div>
        ))}
      </dl>
      {isError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          Could not load metrics.
        </p>
      )}
    </section>
  );
}
