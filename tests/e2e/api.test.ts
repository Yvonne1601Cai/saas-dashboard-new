// End-to-end checks over real HTTP against a RUNNING app and the Auth/Firestore
// emulators:  npm run emulators  |  npm run seed  |  npm run dev  |  npm run test:e2e
// These prove the security claims in the README: roles are enforced by the server,
// not by the UI.
import { beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const AUTH_EMULATOR = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const PASSWORD = "Passw0rd!demo";

async function idTokenFor(email: string, password = PASSWORD, signUp = false) {
  const endpoint = signUp ? "accounts:signUp" : "accounts:signInWithPassword";
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/${endpoint}?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`emulator sign-in failed: ${JSON.stringify(body)}`);
  return body.idToken as string;
}

async function login(email: string, opts: { signUp?: boolean } = {}) {
  const idToken = await idTokenFor(email, PASSWORD, opts.signUp);
  const res = await fetch(`${BASE}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ idToken }),
  });
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("__session="));
  return { res, setCookie, cookie: setCookie?.split(";")[0] ?? "", body: await res.json().catch(() => null) };
}

interface CallOptions {
  method?: string;
  cookie?: string;
  body?: unknown;
  origin?: string | null;
  redirect?: RequestRedirect;
}
async function call(path: string, { method = "GET", cookie, body, origin = BASE, redirect }: CallOptions = {}) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  if (origin !== null) headers.origin = origin;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // HTML or empty body
  }
  return { status: res.status, json: json as any, text, headers: res.headers }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const validProduct = { name: "E2E Widget", category: "Hardware", priceCents: 2500, status: "active", unitsSold: 4 };

let admin: string;
let viewer: string;

beforeAll(async () => {
  const [a, v] = await Promise.all([login("admin@example.com"), login("viewer@example.com")]);
  admin = a.cookie;
  viewer = v.cookie;
  expect(admin, "run `npm run seed` first").toBeTruthy();
});

describe("authentication", () => {
  it("rejects every API call without a session", async () => {
    for (const path of ["/api/products", "/api/metrics", "/api/users"]) {
      expect((await call(path)).status, path).toBe(401);
    }
    expect((await call("/api/products", { method: "POST", body: validProduct })).status).toBe(401);
  });

  it("rejects forged and garbage session cookies", async () => {
    expect((await call("/api/products", { cookie: "__session=garbage" })).status).toBe(401);
    expect((await call("/api/products", { cookie: `__session=${admin.split("=")[1]}x` })).status).toBe(401);
  });

  it("rejects an invalid ID token when creating a session", async () => {
    const res = await call("/api/auth/session", { method: "POST", body: { idToken: "x".repeat(40) } });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sets a hardened session cookie and never returns the token in the body", async () => {
    const { setCookie, body } = await login("viewer@example.com");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//i);
    expect(JSON.stringify(body)).not.toContain("idToken");
    expect(body.user).toMatchObject({ email: "viewer@example.com", role: "viewer" });
  });

  it("gives a brand-new sign-up the least-privileged role", async () => {
    const email = `new-${Date.now()}@example.com`;
    const { body } = await login(email, { signUp: true });
    expect(body.user.role).toBe("viewer");
  });

  it("clears the cookie on sign-out", async () => {
    const res = await fetch(`${BASE}/api/auth/session`, { method: "DELETE", headers: { origin: BASE, cookie: viewer } });
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join()).toMatch(/__session=;/);
  });
});

describe("viewer role is read-only, enforced by the server", () => {
  it("can read products and metrics", async () => {
    const list = await call("/api/products?limit=5", { cookie: viewer });
    expect(list.status).toBe(200);
    expect(list.json.items.length).toBeGreaterThan(0);
    expect(list.headers.get("cache-control")).toBe("no-store");
    expect((await call("/api/metrics", { cookie: viewer })).status).toBe(200);
  });

  it("cannot create, update or delete", async () => {
    const [{ id }] = (await call("/api/products?limit=1", { cookie: viewer })).json.items;
    expect((await call("/api/products", { method: "POST", cookie: viewer, body: validProduct })).status).toBe(403);
    expect((await call(`/api/products/${id}`, { method: "PATCH", cookie: viewer, body: { name: "hacked" } })).status).toBe(403);
    expect((await call(`/api/products/${id}`, { method: "DELETE", cookie: viewer })).status).toBe(403);
    // ...and nothing changed:
    expect((await call(`/api/products/${id}`, { cookie: viewer })).json.name).not.toBe("hacked");
  });

  it("cannot use admin-only endpoints", async () => {
    expect((await call("/api/users", { cookie: viewer })).status).toBe(403);
    expect((await call("/api/users/someone", { method: "PATCH", cookie: viewer, body: { role: "admin" } })).status).toBe(403);
    expect((await call("/api/ai/description", { method: "POST", cookie: viewer, body: validProduct })).status).toBe(403);
  });

  it("gets a not-authorized page, not the users page", async () => {
    const page = await call("/admin/users", { cookie: viewer });
    expect(page.status).toBe(200);
    expect(page.text).toContain("Not authorized");
  });
});

describe("admin", () => {
  it("runs a full create, read, update, delete cycle", async () => {
    const created = await call("/api/products", { method: "POST", cookie: admin, body: validProduct });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ name: "E2E Widget", revenueCents: 10_000 });
    const id = created.json.id;

    expect((await call(`/api/products/${id}`, { cookie: viewer })).json.name).toBe("E2E Widget");

    const patched = await call(`/api/products/${id}`, { method: "PATCH", cookie: admin, body: { unitsSold: 10 } });
    expect(patched.status).toBe(200);
    expect(patched.json.revenueCents).toBe(25_000);

    expect((await call(`/api/products/${id}`, { method: "DELETE", cookie: admin })).status).toBe(204);
    expect((await call(`/api/products/${id}`, { cookie: admin })).status).toBe(404);
    expect((await call(`/api/products/${id}`, { method: "DELETE", cookie: admin })).status).toBe(404);
  });

  it("validates input and never leaks internals", async () => {
    const bad = await call("/api/products", { method: "POST", cookie: admin, body: { ...validProduct, priceCents: -5 } });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatchObject({ code: "bad_request" });
    expect(bad.json.error.requestId).toBeTruthy();
    expect(bad.headers.get("x-request-id")).toBe(bad.json.error.requestId);

    const smuggled = await call("/api/products", { method: "POST", cookie: admin, body: { ...validProduct, createdBy: "someone-else" } });
    expect(smuggled.status).toBe(400);

    const notJson = await fetch(`${BASE}/api/products`, {
      method: "POST",
      headers: { cookie: admin, origin: BASE, "content-type": "application/json" },
      body: "{oops",
    });
    expect(notJson.status).toBe(400);
  });

  it("returns 400 for an invalid cursor and a malformed id", async () => {
    expect((await call("/api/products?cursor=garbage", { cookie: admin })).status).toBe(400);
    expect((await call("/api/products/not%20valid!", { cookie: admin })).status).toBe(400);
  });

  it("pages through the whole catalogue with cursors, with no duplicates", async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/api/products?limit=20&sort=price&dir=asc${cursor ? `&cursor=${cursor}` : ""}`;
      const page = await call(url, { cookie: admin });
      expect(page.status).toBe(200);
      for (const item of page.json.items) {
        expect(seen.has(item.id), "duplicate across pages").toBe(false);
        seen.add(item.id);
      }
      cursor = page.json.nextCursor;
      pages++;
    } while (cursor && pages < 20);
    const metrics = (await call("/api/metrics", { cookie: admin })).json;
    expect(seen.size).toBe(metrics.totalProducts);
  });

  it("generates a description (mock provider without GEMINI_API_KEY) and validates the input", async () => {
    const ok = await call("/api/ai/description", {
      method: "POST",
      cookie: admin,
      body: { name: "Acme CRM", category: "Software", priceCents: 4900 },
    });
    expect(ok.status).toBe(200);
    expect(ok.json.description).toContain("Acme CRM");
    expect(ok.json.provider).toMatch(/mock|gemini/);

    const bad = await call("/api/ai/description", { method: "POST", cookie: admin, body: { name: "", category: "Software", priceCents: 1 } });
    expect(bad.status).toBe(400);
  });

  it("rate-limits AI generation per user", async () => {
    const body = { name: "Rate test", category: "Other", priceCents: 100 };
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      statuses.push((await call("/api/ai/description", { method: "POST", cookie: admin, body })).status);
    }
    expect(statuses).toContain(429);
  });
});

describe("CSRF protection", () => {
  it("rejects state-changing requests from another origin or with no origin", async () => {
    const attempt = (origin: string | null) =>
      call("/api/products", { method: "POST", cookie: admin, body: validProduct, origin });
    expect((await attempt("https://evil.example")).status).toBe(403);
    expect((await attempt(null)).status).toBe(403);
  });
});

describe("user administration", () => {
  it("lists users, blocks self-demotion, and revokes sessions on role change", async () => {
    const users = await call("/api/users", { cookie: admin });
    expect(users.status).toBe(200);
    const byEmail = (email: string) => users.json.items.find((u: { email: string }) => u.email === email);
    expect(byEmail("admin@example.com")).toMatchObject({ role: "admin" });

    const self = byEmail("admin@example.com").uid;
    expect((await call(`/api/users/${self}`, { method: "PATCH", cookie: admin, body: { role: "viewer" } })).status).toBe(400);
    expect((await call(`/api/users/${self}`, { method: "PATCH", cookie: admin, body: { role: "superuser" } })).status).toBe(400);

    // A fresh viewer session works...
    const victim = await login("viewer@example.com");
    expect((await call("/api/products?limit=1", { cookie: victim.cookie })).status).toBe(200);
    // ...until an admin changes that user's role. Firebase revocation has 1-second
    // granularity, so wait out the sign-in second first.
    await new Promise((r) => setTimeout(r, 1100));
    const target = byEmail("viewer@example.com").uid;
    expect((await call(`/api/users/${target}`, { method: "PATCH", cookie: admin, body: { role: "admin" } })).status).toBe(200);
    expect((await call("/api/products?limit=1", { cookie: victim.cookie })).status, "old session must be revoked").toBe(401);

    // New sign-in carries the new role...
    const promoted = await login("viewer@example.com");
    expect(promoted.body.user.role).toBe("admin");
    // ...then put the demo account back.
    expect((await call(`/api/users/${target}`, { method: "PATCH", cookie: admin, body: { role: "viewer" } })).status).toBe(200);
    expect((await login("viewer@example.com")).body.user.role).toBe("viewer");
  });
});

describe("page protection", () => {
  it("redirects signed-out visitors to /login", async () => {
    for (const path of ["/dashboard", "/admin/users"]) {
      const res = await call(path, { redirect: "manual" });
      expect([302, 303, 307, 308], path).toContain(res.status);
      expect(res.headers.get("location")).toContain("/login");
    }
  });

  it("sends security headers", async () => {
    const res = await call("/login");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
