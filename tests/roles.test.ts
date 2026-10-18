import { describe, expect, it } from "vitest";
import { can, parseRole, type Permission } from "../src/lib/auth/roles.ts";

describe("parseRole", () => {
  it("only an exact 'admin' claim grants admin", () => {
    expect(parseRole("admin")).toBe("admin");
  });

  it.each([undefined, null, "", "ADMIN", "administrator", "viewer", 1, true, {}, ["admin"]])(
    "fails safe to viewer for %j",
    (value) => {
      expect(parseRole(value)).toBe("viewer");
    },
  );
});

describe("can", () => {
  it("lets viewers read but not write, generate or manage users", () => {
    expect(can("viewer", "product:read")).toBe(true);
    const denied: Permission[] = ["product:write", "ai:generate", "user:manage"];
    for (const permission of denied) expect(can("viewer", permission)).toBe(false);
  });

  it("lets admins do everything", () => {
    const all: Permission[] = ["product:read", "product:write", "ai:generate", "user:manage"];
    for (const permission of all) expect(can("admin", permission)).toBe(true);
  });
});
