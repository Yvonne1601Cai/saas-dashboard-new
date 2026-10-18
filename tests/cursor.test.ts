import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, InvalidCursorError, type Cursor } from "../src/lib/products/cursor.ts";

const cases: Cursor[] = [
  { f: "createdAt", v: [1_760_000_000, 123_456_789], id: "abc123" },
  { f: "priceCents", v: 1999, id: "abc123" },
  { f: "nameLower", v: "widget pro", id: "abc123" },
];

describe("cursor", () => {
  it.each(cases)("round-trips a %o cursor", (cursor) => {
    expect(decodeCursor(encodeCursor(cursor), cursor.f)).toEqual(cursor);
  });

  it("produces URL-safe output", () => {
    for (const cursor of cases) expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejects a cursor issued for a different sort field", () => {
    expect(() => decodeCursor(encodeCursor(cases[0]), "priceCents")).toThrow(InvalidCursorError);
  });

  it.each([
    ["not base64 json", "%%%"],
    ["valid base64, not json", Buffer.from("hello").toString("base64url")],
    ["json of the wrong shape", Buffer.from('{"f":"createdAt","v":"x","id":"a"}').toString("base64url")],
    ["an id that could escape the collection", Buffer.from('{"f":"priceCents","v":1,"id":"a/b"}').toString("base64url")],
    ["an unknown field", Buffer.from('{"f":"secret","v":1,"id":"a"}').toString("base64url")],
  ])("rejects %s", (_label, token) => {
    expect(() => decodeCursor(token, "priceCents")).toThrow(InvalidCursorError);
  });
});
