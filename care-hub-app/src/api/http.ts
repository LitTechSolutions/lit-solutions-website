import { ApiError, ForbiddenError, NetworkError, RateLimitedError, RequestError, SessionExpiredError } from "./errors";

// Every Care Hub endpoint lives at /.netlify/functions/<name>, the same
// convention every existing site script already uses (js/cms.js,
// js/search.js) -- see netlify.toml, no rewrite/redirect renames this.
const FUNCTIONS_BASE = "/.netlify/functions";

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

// A non-React module can't call useAuth() directly -- this lets AuthContext
// (the one place that owns top-level signed-in/signed-out state) subscribe
// to "a request just discovered the session is gone," no matter which
// route's own data fetch happened to be the one that noticed. Without
// this, only the specific route whose own useApi() call 401s finds out --
// RequireAuth's top-level state stays "signedIn" and keeps rendering
// AppShell's nav/topbar around that route's own inline "sign in again"
// prompt (the reported bug: a stale menu still showing above the sign-in
// box). Registered once by AuthProvider; safe to call repeatedly.
let onSessionExpired: (() => void) | null = null;
export function registerSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (usable.length === 0) return "";
  const search = new URLSearchParams();
  for (const [key, value] of usable) search.set(key, String(value));
  return `?${search.toString()}`;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: QueryParams;
}

/**
 * Core typed fetch wrapper. Always sends credentials (the session cookie
 * is HttpOnly -- this app never reads or stores it itself, matching
 * every other Care Hub auth surface). Throws a typed error subclass for
 * every non-2xx response so callers can branch on error TYPE, not on a
 * raw status code re-checked at every call site.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query } = options;
  const url = `${FUNCTIONS_BASE}${path}${buildQuery(query)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new NetworkError("Could not reach the server. Check your connection and try again.");
  }

  let json: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new NetworkError("The server returned an unexpected response.");
    }
  }

  if (response.ok) return json as T;

  const message = (json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
    ? (json as { error: string }).error
    : `Request failed (${response.status}).`);

  if (response.status === 401) {
    onSessionExpired?.();
    throw new SessionExpiredError(message, json);
  }
  if (response.status === 403) throw new ForbiddenError(message, json);
  if (response.status === 429) throw new RateLimitedError(message, json);
  throw new RequestError(message, response.status, json);
}

export { ApiError };
