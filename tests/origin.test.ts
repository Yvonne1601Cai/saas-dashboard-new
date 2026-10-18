import { describe, expect, it } from "vitest";
import { ApiError } from "../src/lib/api/errors.ts";
import { assertSameOrigin } from "../src/lib/api/handler.ts";

const req = (method: string, headers: Record<string, string>) => ({
  method,
  headers: new Headers(headers),
});

describe("assertSameOrigin (CSRF defence)", () => {
  it("never blocks safe methods", () => {
    expect(() => assertSameOrigin(req("GET", { host: "app.test" }))).not.toThrow();
  });

  it("allows a state-changing request from our own origin", () => {
    expect(() => assertSameOrigin(req("POST", { host: "app.test", origin: "https://app.test" }))).not.toThrow();
  });

  it("honours x-forwarded-host behind a proxy", () => {
    const headers = { host: "internal:3000", "x-forwarded-host": "app.test", origin: "https://app.test" };
    expect(() => assertSameOrigin(req("DELETE", headers))).not.toThrow();
  });

  it.each([
    ["a foreign origin", { host: "app.test", origin: "https://evil.test" }],
    ["a look-alike origin", { host: "app.test", origin: "https://app.test.evil.test" }],
    ["a missing origin", { host: "app.test" }],
    ["a malformed origin", { host: "app.test", origin: "not a url" }],
  ])("rejects %s on POST", (_label, headers) => {
    expect(() => assertSameOrigin(req("POST", headers))).toThrow(ApiError);
  });
});
