import { describe, expect, it } from "vitest";
import { centsToDollarString, dollarsToCents, formatCents } from "../src/lib/format.ts";

describe("dollarsToCents", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12.50", 1250],
    ["0.07", 7],
    ["0", 0],
    [" 3.10 ", 310],
    // The classic float trap: 19.99 * 100 = 1998.9999999999998
    ["19.99", 1999],
    ["1.15", 115],
  ])("parses %j as %i cents", (input, expected) => {
    expect(dollarsToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "-5", "1e3", "1.234", "1,000", ".5", "5.", "$5"])("rejects %j", (input) => {
    expect(dollarsToCents(input)).toBeNull();
  });
});

describe("formatting", () => {
  it("formats cents as USD", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });
  it("round-trips for form editing", () => {
    expect(centsToDollarString(1999)).toBe("19.99");
    expect(dollarsToCents(centsToDollarString(1999))).toBe(1999);
  });
});
