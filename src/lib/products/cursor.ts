// Opaque pagination cursors.
//
// A cursor is the position of the last item on the previous page: the value of
// the field we are ordering by, plus the document id as a tie-breaker (two
// products can share a price or a name). Firestore resumes with
// startAfter(value, id), so every page costs the same however deep it is,
// unlike offset pagination which re-reads and bills every skipped document.
//
// The cursor is only a position; it grants no access. Every request still goes
// through auth, role checks and the same filters, so a forged cursor can at most
// start a list at a different place, which is why plain base64url JSON (not a
// signed token) is enough here. Decoding validates the shape so garbage returns
// a clean 400 instead of an opaque Firestore error.
import { z } from "zod";
import { productIdSchema } from "./schema.ts";

export type OrderField = "createdAt" | "priceCents" | "nameLower";

const cursorSchema = z.discriminatedUnion("f", [
  z.object({
    f: z.literal("createdAt"),
    // [seconds, nanoseconds]: keeps full Timestamp precision, so two products
    // created in the same millisecond are never skipped or repeated.
    v: z.tuple([z.number().int(), z.number().int().min(0).max(999_999_999)]),
    id: productIdSchema,
  }),
  z.object({ f: z.literal("priceCents"), v: z.number().int(), id: productIdSchema }),
  // Lower-casing can lengthen a string, so allow more than the 120-char name limit.
  z.object({ f: z.literal("nameLower"), v: z.string().max(400), id: productIdSchema }),
]);

export type Cursor = z.infer<typeof cursorSchema>;

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid pagination cursor");
  }
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/** Decodes a cursor and checks it was issued for the field we are sorting by now. */
export function decodeCursor(token: string, expectedField: OrderField): Cursor {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new InvalidCursorError();
  }
  const parsed = cursorSchema.safeParse(raw);
  if (!parsed.success || parsed.data.f !== expectedField) throw new InvalidCursorError();
  return parsed.data;
}
