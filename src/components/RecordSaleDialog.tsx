"use client";

import { useId, useState, type FormEvent } from "react";
import { useRecordSale } from "@/hooks/useProducts";
import { ApiClientError } from "@/lib/api/client";
import { formatCents } from "@/lib/format";
import { saleCreateSchema, type Product } from "@/lib/products/schema";
import { Modal } from "./Modal";
import { Button, Field, inputClass } from "./ui";

export function RecordSaleDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const uid = useId();
  const record = useRecordSale();
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const parsed = /^\d+$/.test(quantity.trim()) ? saleCreateSchema.safeParse({ quantity: Number(quantity) }) : null;
  const valid = parsed?.success ? parsed.data : null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!valid) {
      setError("Enter a whole number, 1 or more");
      return;
    }
    try {
      await record.mutateAsync({ id: product.id, quantity: valid.quantity });
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Could not record the sale.");
    }
  }

  return (
    <Modal title="Record sale" onClose={onClose}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-slate-600">
          <strong className="font-medium text-slate-900">{product.name}</strong> at {formatCents(product.priceCents)} each.
          The sale keeps this price even if the product&apos;s price changes later.
        </p>
        <Field
          id={`${uid}-quantity`}
          label="Units sold"
          error={error ?? undefined}
          hint={valid ? `Total ${formatCents(valid.quantity * product.priceCents)}` : undefined}
        >
          {(aria) => (
            <input
              {...aria}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setError(null);
              }}
              inputMode="numeric"
              className={inputClass}
            />
          )}
        </Field>
        <div role="alert" className="min-h-5 text-sm text-red-600">
          {formError}
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={record.isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={record.isPending}>
            {record.isPending ? "Recording…" : "Record sale"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
