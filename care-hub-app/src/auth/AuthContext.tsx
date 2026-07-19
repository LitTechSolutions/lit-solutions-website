import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import { registerSessionExpiredHandler } from "../api/http";
import { SessionExpiredError } from "../api/errors";
import type { AuthenticatedUser } from "../api/types";

type AuthState =
  | { status: "checking" }
  | { status: "signedOut" }
  | { status: "error"; message: string }
  | { status: "signedIn"; user: AuthenticatedUser };

interface AuthContextValue {
  state: AuthState;
  /** Called after a successful login, MFA enrollment confirm, or MFA verify -- moves straight to signedIn without a second round-trip. */
  setSignedIn: (user: AuthenticatedUser) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Owns the one piece of state every other Care Hub screen depends on:
 * are we signed in, and as whom. Checks the real session on mount via
 * account.js (the one endpoint every signed-in role can call) rather
 * than trying to read the HttpOnly session cookie directly (impossible
 * by design) or trusting client-side state across a page reload.
 *
 * Deliberate scope limit for this pass: if a page reloads mid-MFA-flow
 * (after password, before a TOTP code is entered), this does NOT resume
 * the pending state -- account.js correctly 401s (no real session yet),
 * so the user lands back on /login and re-enters their password. The
 * short-lived lts_mfa_pending cookie itself is still valid server-side
 * for its remaining TTL, but this app doesn't currently probe for it
 * before showing /login. Acceptable for now; revisit if this proves
 * disruptive in practice.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    api.account
      .get()
      .then(({ user }) => {
        if (!cancelled) setState({ status: "signedIn", user });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof SessionExpiredError) {
          setState({ status: "signedOut" });
          return;
        }
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not verify your session. Try again.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Subscribes to "any request just discovered the session is gone,"
  // regardless of which route's own data fetch was the one that noticed --
  // see registerSessionExpiredHandler's own comment in api/http.ts. Without
  // this, only that one route found out, so RequireAuth kept rendering the
  // full AppShell (nav + topbar) around whatever that route showed for its
  // own "expired" case -- a sign-in prompt nested under a stale menu.
  // Flipping the top-level state here instead means RequireAuth swaps
  // straight to its existing signedOut branch (a clean redirect to
  // /login, no shell at all) the moment any request 401s.
  useEffect(() => {
    registerSessionExpiredHandler(() => setState({ status: "signedOut" }));
    return () => registerSessionExpiredHandler(null);
  }, []);

  const setSignedIn = useCallback((user: AuthenticatedUser) => setState({ status: "signedIn", user }), []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setState({ status: "signedOut" });
    }
  }, []);

  return <AuthContext.Provider value={{ state, setSignedIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be called within an AuthProvider");
  return ctx;
}
