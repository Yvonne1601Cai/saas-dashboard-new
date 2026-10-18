export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "upstream_error"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  upstream_error: 502,
  internal: 500,
};

/**
 * An error whose message is safe to show to the caller. Anything that is NOT an
 * ApiError is treated as a bug: it is logged in full but the client only gets a
 * generic 500, so stack traces and Firestore internals never leak.
 */
// Fields are declared explicitly (not as constructor parameter properties) so the
// file stays valid "erasable" TypeScript that Node can run directly in scripts/.
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

/** Wire format of every error response. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown; requestId: string };
}
