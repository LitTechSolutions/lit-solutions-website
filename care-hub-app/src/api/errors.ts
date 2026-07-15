// Typed error hierarchy for the API client. Every non-2xx response from
// a Care Hub endpoint is JSON-shaped { error: string } (see
// netlify/functions/_lib/auth_utils.js's json() helper) -- these classes
// carry that message plus a status-specific type the UI layer can
// switch on to pick the right state screen (see
// src/components/states/*.tsx) without re-deriving intent from a raw
// numeric status code at every call site.
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** 401 -- no session, or the session cookie is missing/expired/invalid. */
export class SessionExpiredError extends ApiError {
  constructor(message: string, body: unknown) {
    super(message, 401, body);
    this.name = "SessionExpiredError";
  }
}

/** 403 -- authenticated, but rbac.js denied this specific action. */
export class ForbiddenError extends ApiError {
  constructor(message: string, body: unknown) {
    super(message, 403, body);
    this.name = "ForbiddenError";
  }
}

/** 429 -- rate limited (login, MFA, invitation, etc.). */
export class RateLimitedError extends ApiError {
  constructor(message: string, body: unknown) {
    super(message, 429, body);
    this.name = "RateLimitedError";
  }
}

/** 400/404/409/422 -- validation or not-found; message is safe to show as-is. */
export class RequestError extends ApiError {
  constructor(message: string, status: number, body: unknown) {
    super(message, status, body);
    this.name = "RequestError";
  }
}

/** Network failure, timeout, or a non-JSON response -- not a real API answer at all. */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

export function isSessionExpired(err: unknown): err is SessionExpiredError {
  return err instanceof SessionExpiredError;
}
export function isForbidden(err: unknown): err is ForbiddenError {
  return err instanceof ForbiddenError;
}
export function isRateLimited(err: unknown): err is RateLimitedError {
  return err instanceof RateLimitedError;
}
