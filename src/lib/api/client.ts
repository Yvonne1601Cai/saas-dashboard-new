import type { ErrorBody, ErrorCode } from "./errors.ts";

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ErrorCode | "network";
  readonly issues: FieldIssue[];
  readonly requestId?: string;

  constructor(status: number, code: ApiClientError["code"], message: string, issues: FieldIssue[] = [], requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.issues = issues;
    this.requestId = requestId;
  }
}

/** Typed fetch wrapper for our own API. The session cookie is sent automatically. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiClientError(0, "network", "Network error. Check your connection and try again.");
  }

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  // Session expired or revoked (for example an admin changed this user's role).
  // A full page load (not router.push) is deliberate: it discards the in-memory
  // query cache, so nothing from the previous session can linger on screen.
  if (response.status === 401 && typeof window !== "undefined") {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  let body: Partial<ErrorBody> = {};
  try {
    body = await response.json();
  } catch {
    // non-JSON error body: fall through to the generic message
  }
  const error = body.error;
  throw new ApiClientError(
    response.status,
    error?.code ?? "internal",
    error?.message ?? "Something went wrong",
    Array.isArray(error?.details) ? (error.details as FieldIssue[]) : [],
    error?.requestId,
  );
}
