"use client";

import { useState } from "react";
import { useDeleteProduct } from "@/hooks/useProducts";
import { ApiClientError } from "@/lib/api/client";
import type { Product } from "@/lib/products/schema";
import { Modal } from "./Modal";
import { Button } from "./ui";

export function DeleteDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const remove = useDeleteProduct();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await remove.mutateAsync(product.id);
      onClose();
    } catch (err) {
      // A 404 means someone else already deleted it; the list refresh will reflect that.
      setError(err instanceof ApiClientError ? err.message : "Could not delete the product.");
    }
  }

  return (
    <Modal title="Delete product?" onClose={onClose}>
      <p className="text-sm text-slate-600">
        <strong className="font-medium text-slate-900">{product.name}</strong> will be permanently deleted. To keep it but
        hide it from customers, set its status to inactive instead.
      </p>
      <div role="alert" className="mt-3 min-h-5 text-sm text-red-600">
        {error}
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={remove.isPending}>
          {remove.isPending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Modal>
  );
}
