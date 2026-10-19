"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type {
  Metrics,
  Product,
  ProductCategory,
  ProductCreateInput,
  ProductPage,
  ProductStatus,
  ProductUpdateInput,
  Sale,
  SortDirection,
  SortKey,
} from "@/lib/products/schema";

export interface ProductFilters {
  q: string;
  status: ProductStatus | "";
  category: ProductCategory | "";
  sort: SortKey;
  dir: SortDirection;
}

export const DEFAULT_FILTERS: ProductFilters = { q: "", status: "", category: "", sort: "createdAt", dir: "desc" };
export const PAGE_SIZE = 10;

function toQueryString(filters: ProductFilters, cursor: string | undefined): string {
  const params = new URLSearchParams({ sort: filters.sort, dir: filters.dir, limit: String(PAGE_SIZE) });
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

/** Cursor-paginated list. Changing any filter changes the query key, which starts a fresh list. */
export function useProducts(filters: ProductFilters) {
  return useInfiniteQuery({
    queryKey: ["products", filters],
    queryFn: ({ pageParam }) => api<ProductPage>(`/api/products?${toQueryString(filters, pageParam)}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useMetrics() {
  return useQuery({ queryKey: ["metrics"], queryFn: () => api<Metrics>("/api/metrics") });
}

/** Any write can change the list and the metrics, so refresh both. */
function useInvalidateProducts() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["metrics"] }),
    ]);
}

export function useCreateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (input: ProductCreateInput) => api<Product>("/api/products", { method: "POST", body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductUpdateInput }) =>
      api<Product>(`/api/products/${id}`, { method: "PATCH", body: patch }),
    onSuccess: invalidate,
  });
}

export function useRecordSale() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      api<{ sale: Sale; product: Product }>(`/api/products/${id}/sales`, { method: "POST", body: { quantity } }),
    onSuccess: invalidate,
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/products/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
