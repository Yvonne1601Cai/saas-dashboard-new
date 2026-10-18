import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getSessionUser } from "../auth/guards.ts";
import { can, type Permission } from "../auth/roles.ts";
import type { SessionUser } from "../auth/session.ts";
import { log } from "../logger.ts";
import { ApiError, type ErrorBody } from "./errors.ts";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth on top of the SameSite=Lax session cookie: a state-changing
 * request must come from our own origin. Browsers always attach Origin to
 * POST/PATCH/DELETE, so a missing or foreign Origin is rejected.
 */
export function assertSameOrigin(req: Pick<NextRequest, "headers" | "method">) {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    // malformed Origin falls through to the rejection below
  }
  if (!originHost || originHost !== host) {
    throw new ApiError("forbidden", "Cross-origin request rejected");
  }
}

export interface RouteContext<P> {
  req: NextRequest;
  params: P;
  /** Present on every route except those declared `public: true`. */
  user: SessionUser;
  requestId: string;
}

interface RouteOptions {
  /** Permission the caller's role must grant. Omit only together with `public`. */
  permission?: Permission;
  /** No session required (sign-in / sign-out endpoints). */
  public?: boolean;
}

type Handler<P> = (ctx: RouteContext<P>) => Promise<Response>;

/**
 * Wraps a route handler with everything that must happen on every API call, so
 * individual routes cannot forget it: origin check, authentication, role check,
 * uniform error mapping, request-id, no-store caching and a structured log line.
 */
export function route<P = Record<string, never>>(options: RouteOptions, handler: Handler<P>) {
  return async (req: NextRequest, context: { params: Promise<P> }): Promise<Response> => {
    const requestId = randomUUID();
    const started = performance.now();
    let uid: string | undefined;
    let response: Response;

    try {
      assertSameOrigin(req);

      let user: SessionUser | undefined;
      if (!options.public) {
        user = (await getSessionUser()) ?? undefined;
        if (!user) throw new ApiError("unauthorized", "Authentication required");
        uid = user.uid;
        if (options.permission && !can(user.role, options.permission)) {
          throw new ApiError("forbidden", "You do not have permission to do this");
        }
      }

      response = await handler({
        req,
        params: await context.params,
        user: user as SessionUser,
        requestId,
      });
    } catch (error) {
      response = errorResponse(error, requestId);
    }

    response.headers.set("x-request-id", requestId);
    // Responses are per-user and must never be stored by shared caches.
    response.headers.set("cache-control", "no-store");
    log(response.status >= 500 ? "error" : "info", "request", {
      requestId,
      method: req.method,
      path: req.nextUrl.pathname, // path only: query strings can contain search terms
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      uid,
    });
    return response;
  };
}

function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ApiError) {
    return error.status >= 500
      ? failure(error.code, error.message, error.status, requestId, undefined)
      : failure(error.code, error.message, error.status, requestId, error.details);
  }
  if (error instanceof ZodError) {
    const details = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return failure("bad_request", "Invalid request", 400, requestId, details);
  }
  // A bug or an infrastructure failure: log everything, tell the client nothing.
  log("error", "unhandled error", {
    requestId,
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
  });
  return failure("internal", "Something went wrong", 500, requestId, undefined);
}

function failure(
  code: ErrorBody["error"]["code"],
  message: string,
  status: number,
  requestId: string,
  details: unknown,
): Response {
  const body: ErrorBody = { error: { code, message, requestId, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status });
}

/** Parses a JSON request body; malformed JSON is the client's fault (400), not a 500. */
export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError("bad_request", "Request body must be valid JSON");
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
