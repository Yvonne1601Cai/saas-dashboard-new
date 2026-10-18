const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/**
 * Parses a user-typed dollar amount ("12", "12.5", "12.50") into integer cents.
 * Returns null for anything else, so the form can show an error instead of
 * silently rounding or accepting "1e3" / "-5" / "abc".
 */
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}
