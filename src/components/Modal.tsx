"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Modal built on the native <dialog> element. showModal() gives us, for free and
 * correctly: a focus trap, Escape to close, inert background, and restoring focus
 * to the button that opened it, which is hard to get right by hand.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal(); // `open` check: React StrictMode runs effects twice in dev
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      // A click on the dimmed backdrop lands on the <dialog> element itself.
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg bg-white p-0 shadow-xl backdrop:bg-slate-900/50"
    >
      <div className="p-6">
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
